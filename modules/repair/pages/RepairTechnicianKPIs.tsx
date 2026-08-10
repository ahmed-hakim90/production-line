import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FileDown, EyeOff, UserMinus, ArrowUpDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { withTenantPath } from '@/lib/tenantPaths';
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import type { FirestoreEmployee, FirestoreUser } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { employeeService } from '../../hr/employeeService';
import { userService } from '../../../services/userService';
import { StatusBadge } from '../components/StatusBadge';
import { resolveRepairSettings } from '../config/repairSettings';
import {
  REPAIR_TECH_KPI_PERIODS,
  UNASSIGNED_TECHNICIAN_ID,
  buildCountBars,
  buildRepairTechAttentionQueue,
  buildRepairTechWorkloadBars,
  buildRepairTechnicianPerfRows,
  compareTechnicianToTeam,
  compareTwoTechnicians,
  filterRepairTechKpiJobs,
  formatRepairTechDeviceLabel,
  formatRepairTechKpiPeriodLabel,
  isRepairTechKpiPeriod,
  isRepairTechKpiSortKey,
  jobsForTechnician,
  listDelayedJobsForScope,
  resolveRepairTechKpiDateInputs,
  resolveRepairTechKpiRange,
  sortRepairTechnicianPerfRows,
  summarizeRepairTechTeam,
  technicianKeyOf,
  type RepairTechKpiJob,
  type RepairTechKpiPeriod,
  type RepairTechKpiSortKey,
  type RepairTechnicianPerfRow,
} from '../lib/repairTechnicianKpis';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import type { FirestoreUserWithRepair, RepairBranch, RepairJob, RepairJobStatus } from '../types';
import { REPAIR_JOB_STATUS_LABELS } from '../types';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
import { computeRepairJobCost } from '../utils/repairBusinessLogic';
import { downloadUtf8Csv } from '../utils/csvExport';
import { mapLegacyRepairStatus } from '../utils/repairStatusIds';

const PAGE_SIZE = 20;

const SORT_OPTIONS: { value: RepairTechKpiSortKey; label: string }[] = [
  { value: 'successRate', label: 'نسبة النجاح' },
  { value: 'revenue', label: 'الإيراد' },
  { value: 'total', label: 'إجمالي الطلبات' },
  { value: 'delivered', label: 'التسليم' },
  { value: 'avgRepairDays', label: 'سرعة الإصلاح (أسرع أولاً)' },
  { value: 'delayed', label: 'المتأخر' },
  { value: 'open', label: 'الجاري' },
];

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);
const fmtPct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(1)}%`;
const fmtDays = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : n.toFixed(1);
const fmtMoney = (n: number) => fmt(Math.round(n));

function toKpiJob(job: RepairJob): RepairTechKpiJob {
  return {
    id: job.id,
    receiptNo: job.receiptNo,
    technicianId: job.technicianId,
    branchId: job.branchId,
    status: job.status,
    deviceType: job.deviceType,
    customerName: job.customerName,
    deviceBrand: job.deviceBrand,
    deviceModel: job.deviceModel,
    createdAt: job.createdAt,
    assignedAt: job.assignedAt,
    updatedAt: job.updatedAt,
    deliveredAt: job.deliveredAt,
    resolvedAt: job.resolvedAt,
    closedAt: job.closedAt,
    dueAt: job.dueAt,
    revenue: computeRepairJobCost(job).finalCost,
  };
}

function successTone(rate: number | null): string {
  if (rate == null) return 'bg-muted-foreground/30';
  if (rate >= 80) return 'bg-emerald-500';
  if (rate >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleDateString('ar-EG');
}

export const RepairTechnicianKPIs: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermission();
  const canView = can('repair.technician.view');
  const canManageBranches = can('repair.branches.manage');

  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);

  const initialPeriod = isRepairTechKpiPeriod(searchParams.get('period'))
    ? (searchParams.get('period') as RepairTechKpiPeriod)
    : 'month';
  const initialDates = resolveRepairTechKpiDateInputs(initialPeriod === 'custom' ? 'month' : initialPeriod);

  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [jobsReady, setJobsReady] = useState(false);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [period, setPeriod] = useState<RepairTechKpiPeriod>(initialPeriod);
  const [from, setFrom] = useState(() => searchParams.get('from') || (initialPeriod === 'custom' ? '' : initialDates.from));
  const [to, setTo] = useState(() => searchParams.get('to') || (initialPeriod === 'custom' ? '' : initialDates.to));
  const [technicianQuery, setTechnicianQuery] = useState(() => searchParams.get('q') || '');
  const [branchFilter, setBranchFilter] = useState<'all' | string>(() => searchParams.get('branch') || 'all');
  const [technicianNameById, setTechnicianNameById] = useState<Map<string, string>>(new Map());
  const [hiddenTechnicianIds, setHiddenTechnicianIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<RepairTechKpiSortKey>(() =>
    isRepairTechKpiSortKey(searchParams.get('sort'))
      ? (searchParams.get('sort') as RepairTechKpiSortKey)
      : 'successRate',
  );
  const [page, setPage] = useState(1);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(() => searchParams.get('tech') || null);
  const [compareTechId, setCompareTechId] = useState<string | null>(() => searchParams.get('compare') || null);
  const [detailTab, setDetailTab] = useState<'overview' | 'delayed' | 'recent'>(() => {
    const tab = searchParams.get('tab');
    return tab === 'delayed' || tab === 'recent' || tab === 'overview' ? tab : 'overview';
  });
  const [pendingUnassign, setPendingUnassign] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const accessibleBranchIds = useMemo(
    () =>
      resolveAccessibleRepairBranchIds({
        user,
        branches,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: canManageBranches,
      }),
    [user, branches, currentEmployee?.id, canManageBranches],
  );
  const accessibleBranchKey = useMemo(
    () => accessibleBranchIds.slice().sort().join(','),
    [accessibleBranchIds],
  );

  const selectableBranches = useMemo(() => {
    if (canManageBranches) return branches;
    const set = new Set(accessibleBranchIds);
    return branches.filter((branch) => set.has(branch.id || ''));
  }, [canManageBranches, branches, accessibleBranchIds]);

  useEffect(() => {
    setJobsReady(false);
    const unsub = canManageBranches
      ? repairJobService.subscribeAll((rows) => {
          setJobs(rows);
          setJobsReady(true);
        })
      : accessibleBranchIds.length > 1
        ? repairJobService.subscribeByBranches(accessibleBranchIds, (rows) => {
            setJobs(rows);
            setJobsReady(true);
          })
        : repairJobService.subscribeByBranch(accessibleBranchIds[0] || '', (rows) => {
            setJobs(rows);
            setJobsReady(true);
          });
    return () => unsub();
  }, [canManageBranches, accessibleBranchKey]);

  useEffect(() => {
    void repairBranchService.list().then(setBranches).catch(() => {
      setBranches([]);
      toast.error('تعذر تحميل فروع الصيانة.');
    });
  }, []);

  useEffect(() => {
    void Promise.allSettled([employeeService.getAll(), userService.getAll()]).then((results) => {
      const employees = results[0].status === 'fulfilled' ? results[0].value : [];
      const users = results[1].status === 'fulfilled' ? results[1].value : [];
      const map = new Map<string, string>();

      const usersById = new Map<string, FirestoreUser>();
      users.forEach((row) => {
        const id = String(row.id || '').trim();
        if (id) usersById.set(id, row);
      });

      employees.forEach((employee: FirestoreEmployee) => {
        const employeeId = String(employee.id || '').trim();
        const userId = String(employee.userId || '').trim();
        const linked = userId ? usersById.get(userId) : undefined;
        const name = String(employee.name || linked?.displayName || linked?.email || '').trim();
        if (employeeId && name) map.set(employeeId, name);
        if (userId && name && !map.has(userId)) map.set(userId, name);
      });

      users.forEach((row) => {
        const id = String(row.id || '').trim();
        const name = String(row.displayName || row.email || '').trim();
        if (id && name && !map.has(id)) map.set(id, name);
      });

      setTechnicianNameById(map);
    });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [period, from, to, technicianQuery, branchFilter, sortKey, hiddenTechnicianIds.join('|')]);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams();
      if (period !== 'month') next.set('period', period);
      if (period === 'custom') {
        if (from) next.set('from', from);
        if (to) next.set('to', to);
      }
      if (branchFilter !== 'all') next.set('branch', branchFilter);
      if (technicianQuery.trim()) next.set('q', technicianQuery.trim());
      if (sortKey !== 'successRate') next.set('sort', sortKey);
      if (selectedTechId) next.set('tech', selectedTechId);
      if (compareTechId) next.set('compare', compareTechId);
      if (selectedTechId && detailTab !== 'overview') next.set('tab', detailTab);
      return prev.toString() === next.toString() ? prev : next;
    }, { replace: true });
  }, [
    period,
    from,
    to,
    branchFilter,
    technicianQuery,
    sortKey,
    selectedTechId,
    compareTechId,
    detailTab,
    setSearchParams,
  ]);

  const applyPeriod = (next: RepairTechKpiPeriod) => {
    setPeriod(next);
    if (next !== 'custom') {
      const dates = resolveRepairTechKpiDateInputs(next);
      setFrom(dates.from);
      setTo(dates.to);
    }
  };

  const resetFilters = () => {
    applyPeriod('month');
    setTechnicianQuery('');
    setBranchFilter('all');
    setHiddenTechnicianIds([]);
    setSortKey('successRate');
    setSelectedTechId(null);
    setCompareTechId(null);
    setDetailTab('overview');
  };

  const kpiJobs = useMemo(() => jobs.map(toKpiJob), [jobs]);

  const range = useMemo(
    () => resolveRepairTechKpiRange(period, { from, to }),
    [period, from, to],
  );

  const filtered = useMemo(
    () =>
      filterRepairTechKpiJobs(kpiJobs, {
        range,
        branchId: branchFilter,
        technicianQuery,
        technicianNameById,
        hiddenTechnicianIds,
      }),
    [kpiJobs, range, branchFilter, technicianQuery, technicianNameById, hiddenTechnicianIds],
  );

  const technicianRows = useMemo(() => {
    const rows = buildRepairTechnicianPerfRows(filtered, {
      openStatusIds: repairSettings.workflow.openStatusIds,
    });
    return sortRepairTechnicianPerfRows(
      rows,
      sortKey,
      sortKey === 'avgRepairDays' ? 'asc' : 'desc',
    );
  }, [filtered, repairSettings.workflow.openStatusIds, sortKey]);

  const totals = useMemo(
    () =>
      summarizeRepairTechTeam(technicianRows, filtered, {
        openStatusIds: repairSettings.workflow.openStatusIds,
      }),
    [technicianRows, filtered, repairSettings.workflow.openStatusIds],
  );

  const deviceBars = useMemo(() => {
    const breakdown: Record<string, number> = {};
    filtered.forEach((job) => {
      const key = String(job.deviceType || '').trim() || 'غير محدد';
      breakdown[key] = (breakdown[key] || 0) + 1;
    });
    return buildCountBars(breakdown);
  }, [filtered]);

  const topPerformers = useMemo(
    () =>
      technicianRows
        .filter((row) => row.technicianId !== UNASSIGNED_TECHNICIAN_ID && (row.successRate != null || row.delivered > 0))
        .slice(0, 3),
    [technicianRows],
  );

  const attentionQueue = useMemo(
    () => buildRepairTechAttentionQueue(technicianRows, totals, 5),
    [technicianRows, totals],
  );

  const delayedInScope = useMemo(
    () => listDelayedJobsForScope(filtered, repairSettings.workflow.openStatusIds),
    [filtered, repairSettings.workflow.openStatusIds],
  );

  const workloadBars = useMemo(
    () => buildRepairTechWorkloadBars(technicianRows).slice(0, 8),
    [technicianRows],
  );

  const periodLabel = useMemo(
    () => formatRepairTechKpiPeriodLabel(period, from, to),
    [period, from, to],
  );

  const totalPages = Math.max(1, Math.ceil(technicianRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = technicianRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectedRow = useMemo(
    () => (selectedTechId ? technicianRows.find((r) => r.technicianId === selectedTechId) || null : null),
    [selectedTechId, technicianRows],
  );

  const selectedJobs = useMemo(
    () => (selectedTechId ? jobsForTechnician(filtered, selectedTechId) : []),
    [filtered, selectedTechId],
  );

  const selectedDelayedJobs = useMemo(
    () => listDelayedJobsForScope(selectedJobs, repairSettings.workflow.openStatusIds),
    [selectedJobs, repairSettings.workflow.openStatusIds],
  );

  const teamDelta = useMemo(
    () => (selectedRow ? compareTechnicianToTeam(selectedRow, totals) : null),
    [selectedRow, totals],
  );

  const compareRow = useMemo(
    () => (compareTechId ? technicianRows.find((r) => r.technicianId === compareTechId) || null : null),
    [compareTechId, technicianRows],
  );

  const compareSnapshot = useMemo(
    () => (selectedRow && compareRow ? compareTwoTechnicians(selectedRow, compareRow) : null),
    [selectedRow, compareRow],
  );

  const focusTechnician = (
    id: string,
    tab: 'overview' | 'delayed' | 'recent' = 'overview',
  ) => {
    setSelectedTechId(id);
    setDetailTab(tab);
    if (compareTechId === id) setCompareTechId(null);
  };

  const toggleTechnician = (id: string) => {
    if (selectedTechId === id) {
      setSelectedTechId(null);
      setCompareTechId(null);
      setDetailTab('overview');
      return;
    }
    focusTechnician(id);
  };

  const selectedDeviceBars = useMemo(
    () => (selectedRow ? buildCountBars(selectedRow.deviceBreakdown) : []),
    [selectedRow],
  );

  const selectedStatusBars = useMemo(
    () =>
      selectedRow
        ? buildCountBars(
            selectedRow.statusBreakdown,
            (key) => {
              const canon = mapLegacyRepairStatus(key);
              return repairSettings.statusMap[canon]?.label
                || REPAIR_JOB_STATUS_LABELS[canon]
                || REPAIR_JOB_STATUS_LABELS[key]
                || key;
            },
          )
        : [],
    [selectedRow, repairSettings.statusMap],
  );

  const resolveTechLabel = (id: string) => {
    if (id === UNASSIGNED_TECHNICIAN_ID) return id;
    return technicianNameById.get(String(id || '').trim()) || `ID: ${id}`;
  };

  const resolveUnassignBranchIds = (technicianId: string): string[] => {
    const normalizedTechnicianId = String(technicianId || '').trim();
    if (!normalizedTechnicianId) return [];
    if (branchFilter !== 'all') return [branchFilter];
    return selectableBranches
      .filter((branch) =>
        (branch.technicianIds || []).map((id) => String(id || '').trim()).includes(normalizedTechnicianId),
      )
      .map((branch) => String(branch.id || '').trim())
      .filter(Boolean);
  };

  const exportCsv = () => {
    const day = new Date().toISOString().slice(0, 10);
    const stamp = period === 'custom' && from && to ? `${from}_${to}` : period;
    downloadUtf8Csv(
      `repair-technician-kpis-${stamp}-${day}.csv`,
      [
        'الفني',
        'معرف الفني',
        'إجمالي الطلبات',
        'تم التسليم',
        'غير قابل للإصلاح',
        'جاري',
        'متأخر',
        'جاهز',
        'نسبة النجاح %',
        'معدل التسليم %',
        'متوسط أيام الإصلاح',
        'الإيراد',
      ],
      technicianRows.map((row) => [
        resolveTechLabel(row.technicianId),
        row.technicianId === UNASSIGNED_TECHNICIAN_ID ? '' : row.technicianId,
        row.total,
        row.delivered,
        row.unrepairable,
        row.open,
        row.delayed,
        row.ready,
        row.successRate == null ? '' : Number(row.successRate.toFixed(2)),
        Number(row.deliveryRate.toFixed(2)),
        row.avgRepairDays == null ? '' : Number(row.avgRepairDays.toFixed(2)),
        Number(row.revenue.toFixed(2)),
      ]),
    );
  };

  const exportDelayedCsv = () => {
    const day = new Date().toISOString().slice(0, 10);
    downloadUtf8Csv(
      `repair-technician-delayed-${day}.csv`,
      ['الإيصال', 'الفني', 'معرف الفني', 'الجهاز', 'الحالة', 'موعد الاستحقاق', 'أيام التأخير', 'معرف الطلب'],
      delayedInScope.map((job) => [
        job.receiptNo || '',
        resolveTechLabel(technicianKeyOf(job)),
        job.technicianId || '',
        formatRepairTechDeviceLabel(job),
        (() => {
          const canon = mapLegacyRepairStatus(job.status);
          return repairSettings.statusMap[canon]?.label
            || REPAIR_JOB_STATUS_LABELS[canon]
            || REPAIR_JOB_STATUS_LABELS[job.status]
            || job.status;
        })(),
        job.dueAt || '',
        Number(job.overdueDays.toFixed(2)),
        job.id || '',
      ]),
    );
  };

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-4 p-4 md:p-6 w-full" dir={dir}>
        <OpsDashPanel title="أداء الفنيين" accent="repair">
          <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض أداء الفنيين.</p>
        </OpsDashPanel>
      </div>
    );
  }

  const hero = [
    {
      key: 'total',
      label: 'إجمالي الأجهزة',
      value: jobsReady ? fmt(totals.totalJobs) : '…',
      meta: `${fmt(totals.technicianCount)} فني`,
      accent: true as const,
    },
    {
      key: 'success',
      label: 'نسبة النجاح',
      value: jobsReady ? fmtPct(totals.successRate) : '…',
      meta: 'من الطلبات المنتهية',
    },
    {
      key: 'avg',
      label: 'متوسط الإصلاح',
      value: jobsReady ? fmtDays(totals.avgRepairDays) : '…',
      meta: 'يوم',
    },
    {
      key: 'revenue',
      label: 'إيراد التسليم',
      value: jobsReady ? fmtMoney(totals.revenue) : '…',
    },
    {
      key: 'open',
      label: 'جاري الآن',
      value: jobsReady ? fmt(totals.open) : '…',
      meta: totals.ready > 0 ? `${fmt(totals.ready)} جاهز` : undefined,
    },
    {
      key: 'delayed',
      label: 'متأخر',
      value: jobsReady ? fmt(totals.delayed) : '…',
      toneClassName: totals.delayed > 0 ? 'ops-dash-kpi-card--warn' : undefined,
    },
  ];

  return (
    <DomainHomeShell
      denseHero
      dir={dir}
      eyebrow={periodLabel}
      hero={hero}
      periods={REPAIR_TECH_KPI_PERIODS.map((p) => ({ value: p.value, label: p.label }))}
      activePeriod={period}
      onPeriodChange={(value) => applyPeriod(value as RepairTechKpiPeriod)}
      periodExtra={
        period === 'custom' ? (
          <div className="ops-dash-custom-dates">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPeriod('custom');
                setFrom(e.target.value);
              }}
              aria-label="من تاريخ"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPeriod('custom');
                setTo(e.target.value);
              }}
              aria-label="إلى تاريخ"
            />
          </div>
        ) : null
      }
      secondarySummary="تصدير وإجراءات"
      secondary={(
        <div className="flex flex-wrap items-center gap-2">
          <Link to={withTenantPath(tenantSlug, '/repair')}>
            <Button type="button" size="sm" variant="outline">العودة للصيانة</Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={technicianRows.length === 0 && delayedInScope.length === 0}
              >
                <FileDown className="h-4 w-4" aria-hidden />
                تصدير
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={technicianRows.length === 0} onClick={exportCsv}>
                ملخص الفنيين (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem disabled={delayedInScope.length === 0} onClick={exportDelayedCsv}>
                الطلبات المتأخرة (CSV)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>
            إعادة تعيين
          </Button>
        </div>
      )}
    >
      <OpsDashPanel title="فلاتر وترتيب" accent="repair" bodyClassName="p-0">
        <SmartFilterBar
          pageId="repair-technician-kpis"
          searchPlaceholder="بحث باسم الفني أو المعرف..."
          searchValue={technicianQuery}
          onSearchChange={setTechnicianQuery}
          filters={[
            {
              key: 'branch',
              label: 'الفرع',
              defaultVisible: true,
              options: [
                { value: 'all', label: 'كل الفروع' },
                ...selectableBranches.map((branch) => ({
                  value: branch.id || '',
                  label: branch.name,
                })),
              ],
            },
          ]}
          filterValues={{
            branch: branchFilter,
          }}
          onFilterChange={(key, value) => {
            if (key === 'branch') setBranchFilter(value);
          }}
          extra={(
            <div className="flex items-center gap-2">
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as RepairTechKpiSortKey)}>
                <SelectTrigger className="h-9 w-[11rem]" aria-label="ترتيب حسب">
                  <ArrowUpDown className="me-1.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                  <SelectValue placeholder="ترتيب" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hiddenTechnicianIds.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setHiddenTechnicianIds([])}
                >
                  إظهار المخفي ({hiddenTechnicianIds.length})
                </Button>
              )}
            </div>
          )}
          className="mb-0 border-0 rounded-none"
        />
      </OpsDashPanel>

      {topPerformers.length > 0 && (
        <OpsDashPanel title="أبرز الأداء في الفترة" accent="repair">
          <div className="grid gap-2 md:grid-cols-3">
            {topPerformers.map((row, index) => (
              <button
                key={row.technicianId}
                type="button"
                onClick={() => focusTechnician(row.technicianId)}
                className="rounded-lg border bg-muted/20 p-3 text-right transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
                  <Badge variant="secondary">{fmtPct(row.successRate)}</Badge>
                </div>
                <p className="truncate text-sm font-semibold">{resolveTechLabel(row.technicianId)}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
                  <span>{fmt(row.delivered)} تسليم</span>
                  <span>{fmtMoney(row.revenue)} إيراد</span>
                  <span>{fmtDays(row.avgRepairDays)} يوم</span>
                  {row.delayed > 0 && <span className="text-rose-600">{fmt(row.delayed)} متأخر</span>}
                </div>
              </button>
            ))}
          </div>
        </OpsDashPanel>
      )}

      {(attentionQueue.length > 0 || delayedInScope.length > 0) && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {attentionQueue.length > 0 && (
            <OpsDashPanel
              title="يحتاجون متابعة"
              accent="repair"
              className="border-amber-200/80 dark:border-amber-900/40"
            >
              <div className="space-y-2">
                {attentionQueue.map((item) => (
                  <button
                    key={item.technicianId}
                    type="button"
                    onClick={() => {
                      focusTechnician(
                        item.technicianId,
                        item.delayed > 0 ? 'delayed' : 'overview',
                      );
                    }}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border bg-amber-50/40 p-2.5 text-right transition-colors hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold">{resolveTechLabel(item.technicianId)}</p>
                      <div className="flex flex-wrap gap-1">
                        {item.reasons.map((reason) => (
                          <Badge key={reason} variant="outline" className="text-[10px]">
                            {reason === 'delayed' ? 'متأخر' : reason === 'low_success' ? 'نجاح منخفض' : 'بطء إصلاح'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-left text-[11px] tabular-nums text-muted-foreground">
                      {item.delayed > 0 && <div className="font-semibold text-rose-600">{fmt(item.delayed)} متأخر</div>}
                      <div>{fmtPct(item.successRate)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </OpsDashPanel>
          )}

          {delayedInScope.length > 0 && (
            <OpsDashPanel
              title="طلبات متأخرة في الفترة"
              accent="repair"
              className="border-rose-200/80 dark:border-rose-900/40"
              action={<Badge variant="destructive">{fmt(delayedInScope.length)}</Badge>}
            >
              <div className="erp-mobile-card-list p-2 md:hidden">
                {delayedInScope.slice(0, 8).map((job) => (
                  <div
                    key={job.id || job.receiptNo}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold">
                          {job.id ? (
                            <Link
                              className="text-primary underline"
                              to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
                            >
                              {job.receiptNo || job.id.slice(0, 8)}
                            </Link>
                          ) : (job.receiptNo || '—')}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatRepairTechDeviceLabel(job)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-rose-600 tabular-nums">
                        {job.overdueDays.toFixed(0)} ي
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => focusTechnician(technicianKeyOf(job), 'delayed')}
                      >
                        {resolveTechLabel(technicianKeyOf(job))}
                      </button>
                      <span className="text-muted-foreground tabular-nums">{formatDate(job.dueAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="erp-desktop-table hidden overflow-x-auto md:block">
                <table className="table erp-table w-full text-xs">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th text-right">إيصال</th>
                      <th className="erp-th text-right">الفني</th>
                      <th className="erp-th text-right">الجهاز</th>
                      <th className="erp-th text-right">موعد</th>
                      <th className="erp-th text-right">تأخير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delayedInScope.slice(0, 8).map((job) => (
                      <tr key={job.id || job.receiptNo} className="border-t">
                        <td className="p-2 font-mono">
                          {job.id ? (
                            <Link
                              className="text-primary underline"
                              to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
                            >
                              {job.receiptNo || job.id.slice(0, 8)}
                            </Link>
                          ) : (job.receiptNo || '—')}
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-right text-primary underline-offset-2 hover:underline"
                            onClick={() => {
                              focusTechnician(technicianKeyOf(job), 'delayed');
                            }}
                          >
                            {resolveTechLabel(technicianKeyOf(job))}
                          </button>
                        </td>
                        <td className="p-2 text-muted-foreground">{formatRepairTechDeviceLabel(job)}</td>
                        <td className="p-2 tabular-nums">{formatDate(job.dueAt)}</td>
                        <td className="p-2 tabular-nums font-semibold text-rose-600">
                          {job.overdueDays.toFixed(0)} ي
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </OpsDashPanel>
          )}
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <OpsDashPanel title="ملخص الفنيين" accent="repair" bodyClassName="p-0">
          <div className="erp-mobile-card-list p-2 xl:hidden">
            {!jobsReady ? (
              <p className="py-4 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
                جاري التحميل...
              </p>
            ) : pagedRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">لا توجد بيانات للفلاتر الحالية.</p>
            ) : (
              pagedRows.map((row) => (
                <button
                  key={row.technicianId}
                  type="button"
                  onClick={() => toggleTechnician(row.technicianId)}
                  className={`w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-right shadow-sm transition-colors ${
                    selectedTechId === row.technicianId ? 'ring-2 ring-primary/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{resolveTechLabel(row.technicianId)}</p>
                    <Badge variant="secondary">{fmtPct(row.successRate)}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground tabular-nums">
                    <span>إجمالي {fmt(row.total)}</span>
                    <span>تسليم {fmt(row.delivered)}</span>
                    <span>جاري {fmt(row.open)}</span>
                    <span className={row.delayed > 0 ? 'text-rose-600 font-semibold' : ''}>
                      متأخر {fmt(row.delayed)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="erp-desktop-table hidden overflow-x-auto xl:block">
            <table className="table erp-table w-full min-w-[980px] text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-right">الفني</th>
                  <th className="erp-th text-right">إجمالي</th>
                  <th className="erp-th text-right">تسليم</th>
                  <th className="erp-th text-right">غير قابل</th>
                  <th className="erp-th text-right">جاري</th>
                  <th className="erp-th text-right">متأخر</th>
                  <th className="erp-th text-right">نجاح</th>
                  <th className="erp-th text-right">أيام</th>
                  <th className="erp-th text-right">إيراد</th>
                  <th className="erp-th text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {!jobsReady ? (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={10}>
                      <span role="status" aria-live="polite">جاري التحميل...</span>
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={10}>
                      لا توجد بيانات للفلاتر الحالية.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row) => (
                    <TechnicianRow
                      key={row.technicianId}
                      row={row}
                      label={resolveTechLabel(row.technicianId)}
                      selected={selectedTechId === row.technicianId}
                      canUnassign={
                        canManageBranches
                        && row.technicianId !== UNASSIGNED_TECHNICIAN_ID
                        && resolveUnassignBranchIds(row.technicianId).length > 0
                      }
                      showUnassign={canManageBranches}
                      branchHint={
                        row.technicianId !== UNASSIGNED_TECHNICIAN_ID && branchFilter !== 'all'
                          ? selectableBranches.find((b) => (b.id || '') === branchFilter)?.name
                          : undefined
                      }
                      onSelect={() => toggleTechnician(row.technicianId)}
                      onHide={() =>
                        setHiddenTechnicianIds((prev) =>
                          prev.includes(row.technicianId) ? prev : [...prev, row.technicianId],
                        )
                      }
                      onUnassign={() =>
                        setPendingUnassign({
                          id: row.technicianId,
                          name: resolveTechLabel(row.technicianId),
                        })
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          <DataPaginationFooter
            page={safePage}
            totalPages={totalPages}
            totalItems={technicianRows.length}
            onPageChange={setPage}
            itemLabel="فني"
          />
        </OpsDashPanel>

        <div className="space-y-4">
          <OpsDashPanel title="توزيع العبء والإيراد" accent="repair">
            {!jobsReady ? (
              <p className="text-sm text-muted-foreground" role="status">جاري التحميل...</p>
            ) : workloadBars.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد فنيون مسندون في الفترة.</p>
            ) : (
              <div className="space-y-3">
                {workloadBars.map((bar) => (
                  <button
                    key={bar.technicianId}
                    type="button"
                    onClick={() => focusTechnician(bar.technicianId)}
                    className="w-full space-y-1.5 rounded-lg border bg-muted/10 p-2 text-right transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{resolveTechLabel(bar.technicianId)}</span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                        {fmt(bar.total)} طلب · {fmtMoney(bar.revenue)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>حصة الطلبات</span>
                        <span className="tabular-nums">{bar.jobsShare.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-sky-500"
                          style={{ width: `${Math.max(2, Math.min(100, bar.jobsShare))}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>حصة الإيراد</span>
                        <span className="tabular-nums">{bar.revenueShare.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(2, Math.min(100, bar.revenueShare))}%` }}
                        />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </OpsDashPanel>

          <OpsDashPanel title="توزيع الأعطال حسب نوع الجهاز" accent="repair">
            {!jobsReady ? (
              <p className="text-sm text-muted-foreground" role="status">جاري التحميل...</p>
            ) : deviceBars.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أجهزة في الفترة.</p>
            ) : (
              <div className="space-y-2">
                {deviceBars.slice(0, 8).map((bar) => (
                  <div key={bar.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{bar.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmt(bar.count)} · {bar.share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-sky-500"
                        style={{ width: `${Math.max(2, Math.min(100, bar.share))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </OpsDashPanel>

          <OpsDashPanel
            title="تحليل الفني"
            accent="repair"
            className={selectedRow ? 'border-primary/30' : undefined}
            action={selectedRow ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-label="إغلاق التحليل"
                onClick={() => {
                  setSelectedTechId(null);
                  setCompareTechId(null);
                  setDetailTab('overview');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : undefined}
          >
            <p className="mb-3 text-xs text-muted-foreground">
              {selectedRow
                ? resolveTechLabel(selectedRow.technicianId)
                : 'اختر فنياً من الجدول أو من أبرز الأداء.'}
            </p>
            {!selectedRow ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                اضغط صف الفني لعرض تفصيل النجاح والسرعة وأنواع الأجهزة والطلبات المتأخرة.
              </p>
            ) : (
              <TechnicianDetail
                row={selectedRow}
                teamDelta={teamDelta}
                deviceBars={selectedDeviceBars}
                statusBars={selectedStatusBars}
                jobs={selectedJobs}
                delayedJobs={selectedDelayedJobs}
                detailTab={detailTab}
                onDetailTabChange={setDetailTab}
                compareTechId={compareTechId}
                compareOptions={technicianRows.filter(
                  (r) =>
                    r.technicianId !== UNASSIGNED_TECHNICIAN_ID
                    && r.technicianId !== selectedRow.technicianId,
                )}
                resolveTechLabel={resolveTechLabel}
                compareSnapshot={compareSnapshot}
                onCompareChange={setCompareTechId}
                tenantSlug={tenantSlug}
              />
            )}
          </OpsDashPanel>
        </div>
      </div>

      <Dialog open={Boolean(pendingUnassign)} onOpenChange={(next) => { if (!next) setPendingUnassign(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد إزالة الفني من الفرع</DialogTitle>
            <DialogDescription>
              سيتم فك ربط الفني <span className="font-semibold">{pendingUnassign?.name || '—'}</span>
              {' '}
              {branchFilter === 'all' ? 'من كل الفروع المتاحة.' : 'من الفرع المحدد في الفلتر.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={removing} onClick={() => setPendingUnassign(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removing || !pendingUnassign}
              onClick={async () => {
                if (!pendingUnassign) return;
                try {
                  setRemoving(true);
                  const targetBranchIds = resolveUnassignBranchIds(pendingUnassign.id);
                  if (targetBranchIds.length === 0) {
                    throw new Error('لا توجد فروع مرتبطة بهذا الفني لإزالته منها.');
                  }
                  for (const targetBranchId of targetBranchIds) {
                    await repairBranchService.removeTechnicianFromBranch(targetBranchId, pendingUnassign.id);
                  }
                  setBranches((prev) => prev.map((branch) => {
                    if (!targetBranchIds.includes(String(branch.id || ''))) return branch;
                    return {
                      ...branch,
                      technicianIds: (branch.technicianIds || []).filter(
                        (techId) => String(techId || '').trim() !== pendingUnassign.id,
                      ),
                    };
                  }));
                  toast.success(
                    targetBranchIds.length > 1
                      ? `تمت إزالة الفني من ${targetBranchIds.length} فروع.`
                      : 'تمت إزالة الفني من الفرع.',
                  );
                  setPendingUnassign(null);
                } catch (error: unknown) {
                  const message = error instanceof Error ? error.message : 'تعذر إزالة الفني من الفرع.';
                  toast.error(message);
                } finally {
                  setRemoving(false);
                }
              }}
            >
              {removing ? 'جارٍ الإزالة...' : 'تأكيد الإزالة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DomainHomeShell>
  );
};

function TechnicianRow({
  row,
  label,
  selected,
  canUnassign,
  showUnassign,
  branchHint,
  onSelect,
  onHide,
  onUnassign,
}: {
  row: RepairTechnicianPerfRow;
  label: string;
  selected: boolean;
  canUnassign: boolean;
  showUnassign: boolean;
  branchHint?: string;
  onSelect: () => void;
  onHide: () => void;
  onUnassign: () => void;
}) {
  const isUnassigned = row.technicianId === UNASSIGNED_TECHNICIAN_ID;
  const successPct = row.successRate ?? 0;
  const successBarWidth = row.successRate == null ? 0 : Math.max(0, Math.min(100, successPct));

  return (
    <tr
      className={`border-t cursor-pointer hover:bg-muted/40 ${selected ? 'bg-primary/5' : ''}`}
      onClick={onSelect}
    >
      <td className="p-2 font-medium">
        <div className="flex flex-col gap-0.5">
          <span>{label}</span>
          {branchHint && (
            <span className="text-[10px] text-muted-foreground">الفرع: {branchHint}</span>
          )}
        </div>
      </td>
      <td className="p-2 tabular-nums font-mono">{fmt(row.total)}</td>
      <td className="p-2 tabular-nums font-mono text-emerald-700 dark:text-emerald-400">{fmt(row.delivered)}</td>
      <td className="p-2 tabular-nums font-mono">{fmt(row.unrepairable)}</td>
      <td className="p-2 tabular-nums font-mono">{fmt(row.open)}</td>
      <td className="p-2 tabular-nums font-mono">
        {row.delayed > 0 ? (
          <span className="font-semibold text-rose-600">{fmt(row.delayed)}</span>
        ) : (
          fmt(row.delayed)
        )}
      </td>
      <td className="p-2">
        <div className="min-w-[6.5rem] space-y-1">
          <div className="tabular-nums">{fmtPct(row.successRate)}</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-1.5 rounded-full ${successTone(row.successRate)}`}
              style={{ width: `${successBarWidth}%` }}
            />
          </div>
        </div>
      </td>
      <td className="p-2 tabular-nums">{fmtDays(row.avgRepairDays)}</td>
      <td className="p-2 tabular-nums font-mono">{fmtMoney(row.revenue)}</td>
      <td className="p-2" onClick={(e) => e.stopPropagation()}>
        {isUnassigned ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2" onClick={onHide}>
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
              إخفاء
            </Button>
            {showUnassign && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8 gap-1 px-2"
                disabled={!canUnassign}
                title={!canUnassign ? 'الفني غير مربوط بأي فرع متاح' : undefined}
                onClick={onUnassign}
              >
                <UserMinus className="h-3.5 w-3.5" aria-hidden />
                إزالة
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function TechnicianDetail({
  row,
  teamDelta,
  deviceBars,
  statusBars,
  jobs,
  delayedJobs,
  detailTab,
  onDetailTabChange,
  compareTechId,
  compareOptions,
  resolveTechLabel,
  compareSnapshot,
  onCompareChange,
  tenantSlug,
}: {
  row: RepairTechnicianPerfRow;
  teamDelta: ReturnType<typeof compareTechnicianToTeam> | null;
  deviceBars: ReturnType<typeof buildCountBars>;
  statusBars: ReturnType<typeof buildCountBars>;
  jobs: RepairTechKpiJob[];
  delayedJobs: ReturnType<typeof listDelayedJobsForScope>;
  detailTab: 'overview' | 'delayed' | 'recent';
  onDetailTabChange: (tab: 'overview' | 'delayed' | 'recent') => void;
  compareTechId: string | null;
  compareOptions: RepairTechnicianPerfRow[];
  resolveTechLabel: (id: string) => string;
  compareSnapshot: ReturnType<typeof compareTwoTechnicians> | null;
  onCompareChange: (id: string | null) => void;
  tenantSlug?: string;
}) {
  const recentJobs = [...jobs]
    .sort((a, b) => {
      const aMs = Date.parse(a.deliveredAt || a.resolvedAt || a.updatedAt || a.createdAt || '') || 0;
      const bMs = Date.parse(b.deliveredAt || b.resolvedAt || b.updatedAt || b.createdAt || '') || 0;
      return bMs - aMs;
    })
    .slice(0, 10);

  const tabs: { id: typeof detailTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'نظرة عامة' },
    { id: 'delayed', label: 'متأخر', count: delayedJobs.length },
    { id: 'recent', label: 'أحدث', count: jobs.length },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MiniStat label="نجاح" value={fmtPct(row.successRate)} />
        <MiniStat label="تسليم / إجمالي" value={`${fmt(row.delivered)} / ${fmt(row.total)}`} />
        <MiniStat label="متوسط الأيام" value={fmtDays(row.avgRepairDays)} />
        <MiniStat label="إيراد" value={fmtMoney(row.revenue)} />
        <MiniStat label="جاري" value={fmt(row.open)} />
        <MiniStat label="متأخر" value={fmt(row.delayed)} tone={row.delayed > 0 ? 'danger' : undefined} />
      </div>

      {teamDelta && (
        <div className="rounded-lg border bg-muted/15 p-2.5">
          <p className="mb-2 text-[11px] font-semibold text-muted-foreground">مقارنة بمتوسط الفريق</p>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <DeltaChip
              label="نجاح"
              value={teamDelta.successRateDelta}
              format={(n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`}
              betterWhen="higher"
            />
            <DeltaChip
              label="سرعة"
              value={teamDelta.avgRepairDaysDelta}
              format={(n) => `${n > 0 ? '+' : ''}${n.toFixed(1)} ي`}
              betterWhen="lower"
            />
            <DeltaChip
              label="حصة الإيراد"
              value={teamDelta.revenueShare}
              format={(n) => `${n.toFixed(0)}%`}
              betterWhen="neutral"
            />
            <DeltaChip
              label="حصة المتأخر"
              value={teamDelta.delayedShare}
              format={(n) => `${n.toFixed(0)}%`}
              betterWhen="lower"
            />
          </div>
        </div>
      )}

      {compareOptions.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">مقارنة مع فني آخر</Label>
          <Select
            value={compareTechId || 'none'}
            onValueChange={(v) => onCompareChange(v === 'none' ? null : v)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="اختر فنياً للمقارنة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون مقارنة</SelectItem>
              {compareOptions.map((opt) => (
                <SelectItem key={opt.technicianId} value={opt.technicianId}>
                  {resolveTechLabel(opt.technicianId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {compareSnapshot && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border p-2 text-xs">
              <div>
                <p className="mb-1 font-semibold">{resolveTechLabel(compareSnapshot.left.technicianId)}</p>
                <p className="tabular-nums text-muted-foreground">
                  نجاح {fmtPct(compareSnapshot.left.successRate)} · إيراد {fmtMoney(compareSnapshot.left.revenue)}
                </p>
              </div>
              <div>
                <p className="mb-1 font-semibold">{resolveTechLabel(compareSnapshot.right.technicianId)}</p>
                <p className="tabular-nums text-muted-foreground">
                  نجاح {fmtPct(compareSnapshot.right.successRate)} · إيراد {fmtMoney(compareSnapshot.right.revenue)}
                </p>
              </div>
              <div className="col-span-2 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 tabular-nums text-muted-foreground">
                <span>
                  فرق النجاح:{' '}
                  {compareSnapshot.successRateDelta == null
                    ? '—'
                    : `${compareSnapshot.successRateDelta > 0 ? '+' : ''}${compareSnapshot.successRateDelta.toFixed(1)}%`}
                </span>
                <span>
                  فرق الأيام:{' '}
                  {compareSnapshot.avgRepairDaysDelta == null
                    ? '—'
                    : `${compareSnapshot.avgRepairDaysDelta > 0 ? '+' : ''}${compareSnapshot.avgRepairDaysDelta.toFixed(1)}`}
                </span>
                <span>فرق التسليم: {compareSnapshot.deliveredDelta > 0 ? '+' : ''}{fmt(compareSnapshot.deliveredDelta)}</span>
                <span>فرق المتأخر: {compareSnapshot.delayedDelta > 0 ? '+' : ''}{fmt(compareSnapshot.delayedDelta)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onDetailTabChange(tab.id)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              detailTab === tab.id
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count != null ? ` (${fmt(tab.count)})` : ''}
          </button>
        ))}
      </div>

      {detailTab === 'overview' && (
        <div className="space-y-4">
          {deviceBars.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">أنواع الأجهزة</p>
              <div className="space-y-1.5">
                {deviceBars.slice(0, 5).map((bar) => (
                  <div key={bar.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{bar.label}</span>
                    <Badge variant="secondary" className="tabular-nums">{fmt(bar.count)}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {statusBars.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">توزيع الحالات</p>
              <div className="space-y-1.5">
                {statusBars.slice(0, 6).map((bar) => (
                  <div key={bar.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{bar.label}</span>
                      <span className="tabular-nums text-muted-foreground">{fmt(bar.count)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-violet-500"
                        style={{ width: `${Math.max(2, Math.min(100, bar.share))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {detailTab === 'delayed' && (
        <div className="erp-table-wrap overflow-x-auto rounded border">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-right">إيصال</th>
                <th className="p-2 text-right">الجهاز</th>
                <th className="p-2 text-right">الحالة</th>
                <th className="p-2 text-right">موعد</th>
                <th className="p-2 text-right">تأخير</th>
              </tr>
            </thead>
            <tbody>
              {delayedJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-muted-foreground">لا توجد طلبات متأخرة.</td>
                </tr>
              ) : delayedJobs.map((job) => (
                <tr key={job.id || job.receiptNo} className="border-t">
                  <td className="p-2 font-mono">
                    {job.id ? (
                      <Link
                        className="text-primary underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
                      >
                        {job.receiptNo || job.id.slice(0, 8)}
                      </Link>
                    ) : (job.receiptNo || '—')}
                  </td>
                  <td className="p-2 text-muted-foreground">{formatRepairTechDeviceLabel(job)}</td>
                  <td className="p-2">
                    <StatusBadge status={job.status as RepairJobStatus} />
                  </td>
                  <td className="p-2 tabular-nums">{formatDate(job.dueAt)}</td>
                  <td className="p-2 tabular-nums font-semibold text-rose-600">
                    {job.overdueDays.toFixed(0)} ي
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailTab === 'recent' && (
        <div className="erp-table-wrap overflow-x-auto rounded border">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-right">إيصال</th>
                <th className="p-2 text-right">الجهاز</th>
                <th className="p-2 text-right">الحالة</th>
                <th className="p-2 text-right">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-muted-foreground">لا توجد طلبات.</td>
                </tr>
              ) : recentJobs.map((job) => (
                <tr key={job.id || job.receiptNo} className="border-t">
                  <td className="p-2 font-mono">
                    {job.id ? (
                      <Link
                        className="text-primary underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}
                      >
                        {job.receiptNo || job.id.slice(0, 8)}
                      </Link>
                    ) : (job.receiptNo || '—')}
                  </td>
                  <td className="p-2 text-muted-foreground">{formatRepairTechDeviceLabel(job)}</td>
                  <td className="p-2">
                    <StatusBadge status={job.status as RepairJobStatus} />
                  </td>
                  <td className="p-2 tabular-nums">
                    {formatDate(job.deliveredAt || job.resolvedAt || job.updatedAt || job.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeltaChip({
  label,
  value,
  format,
  betterWhen,
}: {
  label: string;
  value: number | null;
  format: (n: number) => string;
  betterWhen: 'higher' | 'lower' | 'neutral';
}) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="font-semibold tabular-nums">—</p>
      </div>
    );
  }
  let tone = 'text-foreground';
  if (betterWhen !== 'neutral' && Math.abs(value) >= 0.05) {
    const good = betterWhen === 'higher' ? value > 0 : value < 0;
    tone = good ? 'text-emerald-600' : 'text-rose-600';
  }
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${tone}`}>{format(value)}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger';
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${tone === 'danger' ? 'text-rose-600' : ''}`}>
        {value}
      </p>
    </div>
  );
}

export default RepairTechnicianKPIs;
