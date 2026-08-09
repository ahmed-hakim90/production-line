import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { withTenantPath } from '@/lib/tenantPaths';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import { repairSalesInvoiceService } from '../services/repairSalesInvoiceService';
import { sparePartsService } from '../services/sparePartsService';
import { repairSpareIssueService } from '../services/repairSpareIssueService';
import { repairComplaintService } from '../services/repairComplaintService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { repairPaymentService } from '../services/repairPaymentService';
import { sparePartsReplenishmentService } from '../../inventory/services/sparePartsReplenishmentService';
import type {
  RepairBranch,
  RepairComplaint,
  RepairJob,
  RepairSalesInvoice,
  RepairSpareIssue,
  RepairSparePart,
  RepairSparePartStock,
  RepairTreasuryMonthClose,
  RepairTreasurySession,
  RepairJobFinancial,
  RepairPaymentAuthorization,
} from '../types';
import type { SparePartsReplenishmentRequest } from '../../inventory/types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { useAppStore } from '../../../store/useAppStore';
import type { FirestoreUserWithRepair } from '../types';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
import { resolveRepairSettings } from '../config/repairSettings';
import { downloadUtf8Csv } from '../utils/csvExport';
import { PageHeader } from '@/components/PageHeader';
import {
  countOpenComplaints,
  countOpenSparePartsReplenishments,
  countOpenTreasurySessions,
  countRepairJobQueues,
  countSubmittedSpareIssues,
  summarizeMonthCloses,
} from '../lib/repairAdminDashboardMetrics';
import { normalizeTreasuryMonth } from '../lib/repairTreasuryMonthlyClose';
import { summarizeRepairUnrepairableReasons } from '../lib/repairUnrepairableAnalytics';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);

type BranchKpi = {
  branch: RepairBranch;
  totalJobs: number;
  openJobs: number;
  deliveredJobs: number;
  unrepairableJobs: number;
  readyJobs: number;
  waitingApproval: number;
  waitingParts: number;
  readyToIssueParts: number;
  overdueJobs: number;
  successRate: number;
  revenue: number;
  partsRevenue: number;
  totalRevenue: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  balanceDue: number;
  readyForPayment: number;
  lowStockCount: number;
};

type QueueCard = {
  key: string;
  label: string;
  hint: string;
  count: number;
  tone: string;
  to: string;
  show: boolean;
};

export const RepairAdminDashboard: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [userProfile, userRoleName, systemSettings, userPermissions],
  );
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [jobsReady, setJobsReady] = useState(false);
  const [salesInvoices, setSalesInvoices] = useState<RepairSalesInvoice[]>([]);
  const [partsByBranch, setPartsByBranch] = useState<Record<string, RepairSparePart[]>>({});
  const [stockByBranch, setStockByBranch] = useState<Record<string, RepairSparePartStock[]>>({});
  const [sprRows, setSprRows] = useState<SparePartsReplenishmentRequest[]>([]);
  const [rsiRows, setRsiRows] = useState<RepairSpareIssue[]>([]);
  const [complaints, setComplaints] = useState<RepairComplaint[]>([]);
  const [monthCloses, setMonthCloses] = useState<RepairTreasuryMonthClose[]>([]);
  const [treasurySessions, setTreasurySessions] = useState<RepairTreasurySession[]>([]);
  const [financials, setFinancials] = useState<RepairJobFinancial[]>([]);
  const [paymentAuthorizations, setPaymentAuthorizations] = useState<RepairPaymentAuthorization[]>([]);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const currentMonth = useMemo(() => normalizeTreasuryMonth(''), []);

  const allowedBranchIds = useMemo(
    () =>
      resolveAccessibleRepairBranchIds({
        user: userProfile,
        branches,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: repairCtx.adminSeesAllBranches,
      }),
    [branches, repairCtx.adminSeesAllBranches, userProfile, currentEmployee?.id],
  );

  const allowedBranchKey = useMemo(() => allowedBranchIds.slice().sort().join(','), [allowedBranchIds]);

  const warehouseIdByBranchId = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((branch) => {
      const id = String(branch.id || '').trim();
      const warehouseId = String(branch.warehouseId || '').trim();
      if (id && warehouseId) map[id] = warehouseId;
    });
    return map;
  }, [branches]);

  useEffect(() => {
    let cancelled = false;
    void repairBranchService
      .list()
      .then((rows) => {
        if (!cancelled) setBranches(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setBranches([]);
          toast.error('تعذر تحميل فروع الصيانة.');
        }
      })
      .finally(() => {
        if (!cancelled) setBranchesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setJobsReady(false);
    let unsubJobs: () => void = () => {};
    let unsubInvoices: () => void = () => {};
    const markJobs = (rows: RepairJob[]) => {
      setJobs(rows);
      setJobsReady(true);
    };
    if (repairCtx.adminSeesAllBranches) {
      unsubJobs = repairJobService.subscribeAll(markJobs);
      unsubInvoices = repairSalesInvoiceService.subscribeAll(setSalesInvoices);
    } else if (allowedBranchIds.length > 1) {
      unsubJobs = repairJobService.subscribeByBranches(allowedBranchIds, markJobs);
      unsubInvoices = repairSalesInvoiceService.subscribeByBranches(allowedBranchIds, setSalesInvoices);
    } else {
      const branchId = allowedBranchIds[0] || '';
      unsubJobs = repairJobService.subscribeByBranch(branchId, markJobs);
      unsubInvoices = repairSalesInvoiceService.subscribeByBranch(branchId, setSalesInvoices);
    }
    return () => {
      unsubJobs();
      unsubInvoices();
    };
  }, [repairCtx.adminSeesAllBranches, allowedBranchKey]);

  useEffect(() => {
    if (allowedBranchIds.length === 0) {
      setPartsByBranch({});
      setStockByBranch({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      branches.filter((branch) => allowedBranchIds.includes(String(branch.id || ''))).map(async (branch) => {
        const branchId = branch.id || '';
        const [parts, stock] = await Promise.all([
          sparePartsService.listParts(branchId),
          sparePartsService.listStock(branchId, branch.warehouseId),
        ]);
        return { branchId, parts, stock };
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        const nextParts: Record<string, RepairSparePart[]> = {};
        const nextStock: Record<string, RepairSparePartStock[]> = {};
        rows.forEach((row) => {
          nextParts[row.branchId] = row.parts;
          nextStock[row.branchId] = row.stock;
        });
        setPartsByBranch(nextParts);
        setStockByBranch(nextStock);
      })
      .catch(() => {
        if (!cancelled) toast.error('تعذر تحميل أرصدة قطع الغيار.');
      });
    return () => {
      cancelled = true;
    };
  }, [branches, allowedBranchKey]);

  useEffect(() => {
    if (!branchesLoaded || allowedBranchIds.length === 0) {
      setSprRows([]);
      setRsiRows([]);
      setComplaints([]);
      setMonthCloses([]);
      setTreasurySessions([]);
      return;
    }
    let cancelled = false;
    const warehouseIds = Array.from(
      new Set(
        allowedBranchIds
          .map((branchId) => String(warehouseIdByBranchId[branchId] || '').trim())
          .filter(Boolean),
      ),
    );

    const rsiWarehouseFilter = warehouseIds.length > 0 && warehouseIds.length <= 10
      ? warehouseIds
      : undefined;

    void Promise.allSettled([
      sparePartsReplenishmentService.listRecent(200),
      repairSpareIssueService.listRecent(200, rsiWarehouseFilter),
      repairComplaintService.list(allowedBranchIds.length <= 10 ? allowedBranchIds : undefined),
      repairTreasuryService.listMonthCloses(allowedBranchIds, currentMonth),
      repairTreasuryService.listSessionsForBranches(allowedBranchIds),
    ]).then((results) => {
      if (cancelled) return;
      const fail = (label: string) => toast.error(`تعذر تحميل ${label}.`);
      if (results[0].status === 'fulfilled') setSprRows(results[0].value);
      else {
        setSprRows([]);
        fail('طلبات التوريد');
      }
      if (results[1].status === 'fulfilled') setRsiRows(results[1].value);
      else {
        setRsiRows([]);
        fail('سندات الصرف');
      }
      if (results[2].status === 'fulfilled') {
        const rows = results[2].value;
        const allowed = new Set(allowedBranchIds);
        setComplaints(rows.filter((row) => allowed.has(String(row.branchId || '').trim())));
      } else {
        setComplaints([]);
        fail('الشكاوى');
      }
      if (results[3].status === 'fulfilled') setMonthCloses(results[3].value);
      else {
        setMonthCloses([]);
        fail('إقفال الخزينة الشهري');
      }
      if (results[4].status === 'fulfilled') setTreasurySessions(results[4].value);
      else {
        setTreasurySessions([]);
        fail('جلسات الخزينة');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [branchesLoaded, allowedBranchKey, warehouseIdByBranchId, currentMonth]);

  useEffect(() => {
    if (!can('repair.finance.view') || allowedBranchIds.length === 0) {
      setFinancials([]);
      setPaymentAuthorizations([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      repairPaymentService.listFinancials(allowedBranchIds),
      repairPaymentService.listAuthorizations(allowedBranchIds),
    ]).then(([financialRows, authorizationRows]) => {
      if (cancelled) return;
      setFinancials(financialRows);
      setPaymentAuthorizations(authorizationRows);
    }).catch(() => {
      if (!cancelled) toast.error('تعذر تحميل المؤشرات المالية المحمية.');
    });
    return () => { cancelled = true; };
  }, [allowedBranchKey, can]);

  const cards = useMemo<BranchKpi[]>(() => {
    return branches.filter((branch) => allowedBranchIds.includes(String(branch.id || ''))).map((branch) => {
      const branchId = branch.id || '';
      const branchJobs = jobs.filter((j) => j.branchId === branchId);
      const queues = countRepairJobQueues(branchJobs, repairSettings.workflow.openStatusIds);
      const totalJobs = branchJobs.length;
      const deliveredJobs = branchJobs.filter((j) => j.status === 'delivered').length;
      const unrepairableJobs = branchJobs.filter((j) => j.status === 'unrepairable').length;
      const terminal = deliveredJobs + unrepairableJobs;
      const successRate = terminal > 0 ? (deliveredJobs / terminal) * 100 : 0;
      const branchFinancials = financials.filter((row) => row.branchId === branchId);
      const grossAmount = branchFinancials.reduce((sum, row) => sum + Number(row.grossAmount || 0), 0);
      const discountAmount = branchFinancials.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0);
      const netAmount = branchFinancials.reduce((sum, row) => sum + Number(row.netAmount || 0), 0);
      const paidAmount = branchFinancials.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0);
      const balanceDue = branchFinancials.reduce((sum, row) => sum + Number(row.balanceDue || 0), 0);
      const readyForPayment = paymentAuthorizations.filter((row) =>
        row.branchId === branchId && (row.status === 'approved' || row.status === 'partial'),
      ).length;
      const revenue = netAmount;
      const partsRevenue = salesInvoices
        .filter((invoice) => invoice.branchId === branchId && ['posted', 'active'].includes(String(invoice.status || 'active')))
        .reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
      const totalRevenue = revenue + partsRevenue;

      const parts = partsByBranch[branchId] || [];
      const stock = stockByBranch[branchId] || [];
      const stockMap = new Map(stock.map((s) => [s.partId, Number(s.quantity || 0)]));
      const lowStockCount = parts.filter((p) => Number(stockMap.get(p.id || '') || 0) <= Number(p.minStock || 0)).length;

      return {
        branch,
        totalJobs,
        openJobs: queues.open,
        deliveredJobs,
        unrepairableJobs,
        readyJobs: queues.readyForDelivery,
        waitingApproval: queues.waitingApproval,
        waitingParts: queues.waitingParts,
        readyToIssueParts: queues.readyToIssueParts,
        overdueJobs: queues.overdue,
        successRate,
        revenue,
        partsRevenue,
        totalRevenue,
        grossAmount,
        discountAmount,
        netAmount,
        paidAmount,
        balanceDue,
        readyForPayment,
        lowStockCount,
      };
    });
  }, [branches, allowedBranchIds, jobs, financials, paymentAuthorizations, salesInvoices, partsByBranch, stockByBranch, repairSettings.workflow.openStatusIds]);

  const overview = useMemo(() => {
    const totalJobs = cards.reduce((sum, card) => sum + card.totalJobs, 0);
    const openJobs = cards.reduce((sum, card) => sum + card.openJobs, 0);
    const readyJobs = cards.reduce((sum, card) => sum + card.readyJobs, 0);
    const deliveredJobs = cards.reduce((sum, card) => sum + card.deliveredJobs, 0);
    const unrepairableJobs = cards.reduce((sum, card) => sum + card.unrepairableJobs, 0);
    const waitingApproval = cards.reduce((sum, card) => sum + card.waitingApproval, 0);
    const waitingParts = cards.reduce((sum, card) => sum + card.waitingParts, 0);
    const readyToIssueParts = cards.reduce((sum, card) => sum + card.readyToIssueParts, 0);
    const overdueJobs = cards.reduce((sum, card) => sum + card.overdueJobs, 0);
    const revenue = cards.reduce((sum, card) => sum + card.revenue, 0);
    const partsRevenue = cards.reduce((sum, card) => sum + card.partsRevenue, 0);
    const totalRevenue = cards.reduce((sum, card) => sum + card.totalRevenue, 0);
    const lowStockCount = cards.reduce((sum, card) => sum + card.lowStockCount, 0);
    const grossAmount = cards.reduce((sum, card) => sum + card.grossAmount, 0);
    const discountAmount = cards.reduce((sum, card) => sum + card.discountAmount, 0);
    const netAmount = cards.reduce((sum, card) => sum + card.netAmount, 0);
    const paidAmount = cards.reduce((sum, card) => sum + card.paidAmount, 0);
    const balanceDue = cards.reduce((sum, card) => sum + card.balanceDue, 0);
    const readyForPayment = cards.reduce((sum, card) => sum + card.readyForPayment, 0);
    const terminal = deliveredJobs + unrepairableJobs;
    const successRate = terminal > 0 ? (deliveredJobs / terminal) * 100 : 0;
    return {
      totalJobs,
      openJobs,
      readyJobs,
      deliveredJobs,
      unrepairableJobs,
      waitingApproval,
      waitingParts,
      readyToIssueParts,
      overdueJobs,
      revenue,
      partsRevenue,
      totalRevenue,
      lowStockCount,
      successRate,
      grossAmount,
      discountAmount,
      netAmount,
      paidAmount,
      balanceDue,
      readyForPayment,
    };
  }, [cards]);

  const rankedCards = useMemo(
    () => [...cards].sort((a, b) => b.successRate - a.successRate || b.revenue - a.revenue),
    [cards],
  );

  const sprCounts = useMemo(
    () => countOpenSparePartsReplenishments(sprRows, allowedBranchIds, warehouseIdByBranchId),
    [sprRows, allowedBranchIds, warehouseIdByBranchId],
  );
  const rsiPendingCount = useMemo(
    () => countSubmittedSpareIssues(rsiRows, allowedBranchIds),
    [rsiRows, allowedBranchIds],
  );
  const openComplaintsCount = useMemo(
    () => countOpenComplaints(complaints, allowedBranchIds),
    [complaints, allowedBranchIds],
  );
  const openSessionsCount = useMemo(
    () => countOpenTreasurySessions(treasurySessions, allowedBranchIds),
    [treasurySessions, allowedBranchIds],
  );
  const monthCloseSummary = useMemo(
    () => summarizeMonthCloses(allowedBranchIds, monthCloses),
    [allowedBranchIds, monthCloses],
  );
  const unrepairableAnalytics = useMemo(
    () => summarizeRepairUnrepairableReasons(
      jobs.filter((job) => allowedBranchIds.includes(String(job.branchId || ''))),
    ),
    [jobs, allowedBranchIds],
  );

  const canViewJobs = can('repair.view') || can('repair.adminDashboard.view');
  const canViewReplenishment =
    can('sparePartsReplenishment.view')
    || can('sparePartsReplenishment.create')
    || can('sparePartsReplenishment.receive');
  const canViewSpareIssues = can('repairSpareIssues.view');
  const canViewParts = can('repair.parts.view');
  const canManagePricing = can('repair.pricing.manage');
  const canViewTreasury = can('repair.treasury.view');
  const canViewComplaints = can('repair.complaints.view');
  const canViewTechKpis = can('repair.technician.view');
  const canManageBranches = can('repair.branches.manage');
  const canViewCustomers = can('customers.view');
  const canViewCustomerRequests =
    can('repair.customerRequests.view')
    || can('repair.customerRequests.assign')
    || can('repair.customerRequests.receive');
  const canViewCustody = can('repair.custody.view') || can('repair.custody.handover');
  const canViewReplacements =
    can('repair.replacements.view')
    || can('repair.replacements.create')
    || can('repair.replacements.approve')
    || can('repair.replacements.deliver');

  const path = (suffix: string) => withTenantPath(tenantSlug, suffix);

  const queueCards: QueueCard[] = [
    {
      key: 'payment',
      label: 'جاهز للتحصيل',
      hint: 'أذونات معتمدة بها رصيد مطلوب',
      count: overview.readyForPayment,
      tone: 'text-sky-600',
      to: path('/repair/payments'),
      show: can('repair.payments.view'),
    },
    {
      key: 'approval',
      label: 'بانتظار موافقة العميل',
      hint: 'تقديرات بانتظار رد العميل',
      count: overview.waitingApproval,
      tone: 'text-violet-600',
      to: path('/repair/admin-orders'),
      show: true,
    },
    {
      key: 'parts',
      label: 'بانتظار قطع / توريد',
      hint: 'طلبات بانتظار توريد أو حالة قطع',
      count: overview.waitingParts,
      tone: 'text-amber-600',
      to: path(canViewReplenishment ? '/repair/parts-replenishment' : '/repair/admin-orders'),
      show: true,
    },
    {
      key: 'overdue',
      label: 'متأخر (+7 أيام)',
      hint: 'طلبات مفتوحة تجاوزت 7 أيام',
      count: overview.overdueJobs,
      tone: 'text-rose-600',
      to: path('/repair/admin-orders'),
      show: true,
    },
    {
      key: 'ready',
      label: 'جاهز للتسليم',
      hint: 'مكتمل فنياً وينتظر التسليم',
      count: overview.readyJobs,
      tone: 'text-indigo-600',
      to: path('/repair/admin-orders'),
      show: true,
    },
  ];

  const loading = !branchesLoaded || (!jobsReady && allowedBranchIds.length > 0);
  const emptyBranches = branchesLoaded && allowedBranchIds.length === 0;

  return (
    <div className="erp-ds-clean space-y-5 p-4 md:p-6" dir={dir}>
      <PageHeader
        title="لوحة أوامر الصيانة - الإدارة"
        subtitle="مركز قيادة: طوابير التشغيل، التوريد، الخزينة، أداء الفروع، والشكاوى."
        icon="layout_dashboard"
        actions={(
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="w-fit text-xs">
              عدد الفروع النشطة: {fmt(cards.length)}
            </Badge>
            <Link to={path('/repair/admin-orders')}>
              <Button size="sm" variant="outline">طلبات الأدمن</Button>
            </Link>
            {canViewJobs && (
              <Link to={path('/repair/jobs')}>
                <Button size="sm" variant="outline">الطلبات</Button>
              </Link>
            )}
            {canViewReplenishment && (
              <Link to={path('/repair/parts-replenishment')}>
                <Button size="sm" variant="outline">التوريد</Button>
              </Link>
            )}
            {canViewSpareIssues && (
              <Link to={path('/repair/spare-issues')}>
                <Button size="sm" variant="outline">سندات الصرف</Button>
              </Link>
            )}
            {canViewTreasury && (
              <Link to={path('/repair/treasury-report')}>
                <Button size="sm" variant="outline">تقرير الخزينة</Button>
              </Link>
            )}
            {canViewTechKpis && (
              <Link to={path('/repair/technician-kpis?period=month')}>
                <Button size="sm" variant="outline">أداء الفنيين</Button>
              </Link>
            )}
            {canViewComplaints && (
              <Link to={path('/repair/complaints')}>
                <Button size="sm" variant="outline">الشكاوى</Button>
              </Link>
            )}
            {canViewCustomerRequests && (
              <Link to={path('/repair/customer-requests')}>
                <Button size="sm" variant="outline">طلبات العملاء</Button>
              </Link>
            )}
            {canViewCustody && (
              <Link to={path('/repair/custody-stock')}>
                <Button size="sm" variant="outline">العهدة</Button>
              </Link>
            )}
            {canViewCustody && (
              <Link to={path('/repair/custody-stock?stockType=unrepairable')}>
                <Button size="sm" variant="outline">غير القابل</Button>
              </Link>
            )}
            {canViewReplacements && (
              <Link to={path('/repair/replacements')}>
                <Button size="sm" variant="outline">الاستبدال</Button>
              </Link>
            )}
            {canManagePricing && (
              <Link to={path('/manufacturing/materials')}>
                <Button size="sm" variant="outline">التسعير (الماستر)</Button>
              </Link>
            )}
            {canManageBranches && (
              <Link to={path('/repair/branches')}>
                <Button size="sm" variant="outline">الفروع</Button>
              </Link>
            )}
            {canViewCustomers && (
              <Link to={path('/customers/kpi')}>
                <Button size="sm" variant="outline">مؤشرات العملاء</Button>
              </Link>
            )}
          </div>
        )}
      />

      {loading && (
        <Card className="shadow-sm">
          <CardContent className="py-8 text-sm text-muted-foreground text-center">
            جاري تحميل لوحة الأدمن…
          </CardContent>
        </Card>
      )}

      {emptyBranches && (
        <Card className="shadow-sm">
          <CardContent className="py-8 text-sm text-muted-foreground text-center">
            لا توجد فروع ضمن نطاق صلاحيتك حالياً.
          </CardContent>
        </Card>
      )}

      {!loading && !emptyBranches && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="shadow-sm">
              <CardContent className="pt-5 space-y-1">
                <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
                <p className="text-2xl font-bold tabular-nums">{fmt(overview.totalJobs)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-5 space-y-1">
                <p className="text-xs text-muted-foreground">طلبات قيد التنفيذ</p>
                <p className="text-2xl font-bold text-amber-600 tabular-nums">{fmt(overview.openJobs)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-5 space-y-1">
                <p className="text-xs text-muted-foreground">جاهز للتسليم</p>
                <p className="text-2xl font-bold text-indigo-600 tabular-nums">{fmt(overview.readyJobs)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-5 space-y-1">
                <p className="text-xs text-muted-foreground">إيراد الصيانة</p>
                <p className="text-2xl font-bold text-emerald-600 tabular-nums">{fmt(overview.revenue)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-5 space-y-1">
                <p className="text-xs text-muted-foreground">مبيعات قطع الغيار</p>
                <p className="text-2xl font-bold text-sky-600 tabular-nums">{fmt(overview.partsRevenue)}</p>
              </CardContent>
            </Card>
          </div>

          {can('repair.finance.view') ? (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">الملخص المالي المحمي</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  ['الإجمالي', overview.grossAmount, 'text-slate-700'],
                  ['الخصومات', overview.discountAmount, 'text-rose-600'],
                  ['الصافي', overview.netAmount, 'text-indigo-600'],
                  ['المحصل', overview.paidAmount, 'text-emerald-600'],
                  ['المتبقي', overview.balanceDue, 'text-amber-700'],
                ].map(([label, value, tone]) => (
                  <div key={String(label)} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{fmt(Number(value))} ج.م</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">طوابير التشغيل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {queueCards.filter((card) => card.show).map((card) => (
                  <Link key={card.key} to={card.to} className="block rounded-lg border bg-background p-3 hover:bg-muted/40 transition-colors">
                    <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
                    <p className={`text-2xl font-bold tabular-nums ${card.tone}`}>{fmt(card.count)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.hint}</p>
                  </Link>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground mb-1">نسبة النجاح العامة</p>
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <span className="font-semibold tabular-nums">{overview.successRate.toFixed(1)}%</span>
                    <span className="text-xs text-muted-foreground text-left">
                      {fmt(overview.deliveredJobs)} تسليم، {fmt(overview.unrepairableJobs)} غير قابلة للإصلاح
                      {' '}
                      (منتهية: {fmt(overview.deliveredJobs + overview.unrepairableJobs)})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, Math.max(0, overview.successRate))}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground mb-1">جاهز للصرف من المخزن</p>
                  <p className="text-xl font-bold tabular-nums text-sky-700">{fmt(overview.readyToIssueParts)}</p>
                  <p className="text-xs text-muted-foreground mt-1">قطع وصلت للتوريد وبانتظار الصرف على الطلب.</p>
                </div>
                <Link
                  to={path(canViewParts ? '/repair/parts' : '/repair/admin-orders')}
                  className="rounded-lg border bg-background p-3 hover:bg-muted/40 transition-colors block"
                >
                  <p className="text-xs text-muted-foreground mb-1">تنبيه المخزون</p>
                  <p className={`text-xl font-bold tabular-nums ${overview.lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {fmt(overview.lowStockCount)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">أصناف تحت الحد الأدنى عبر الفروع المسموحة.</p>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">تحليل أسباب عدم قابلية الإصلاح وإعادة الفتح</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">طلبات متأثرة</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{fmt(unrepairableAnalytics.affectedJobs)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">إجمالي قرارات الوحدات</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-rose-600">{fmt(unrepairableAnalytics.decisionQuantity)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">الرصيد الحالي غير القابل</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-amber-700">{fmt(unrepairableAnalytics.currentStockQuantity)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">أُعيد فتحها للصيانة</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">{fmt(unrepairableAnalytics.reopenedQuantity)}</p>
                </div>
              </div>
              {unrepairableAnalytics.reasons.length === 0 ? (
                <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">
                  لا توجد قرارات غير قابلة للإصلاح مصنفة بعد.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-right font-medium">السبب</th>
                        <th className="px-3 py-2 text-right font-medium">الطلبات</th>
                        <th className="px-3 py-2 text-right font-medium">الوحدات المسجلة</th>
                        <th className="px-3 py-2 text-right font-medium">الموجود حاليًا</th>
                        <th className="px-3 py-2 text-right font-medium">أُعيد للصيانة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unrepairableAnalytics.reasons.map((row) => (
                        <tr key={row.code} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium">{row.label}</td>
                          <td className="px-3 py-2 tabular-nums">{fmt(row.jobs)}</td>
                          <td className="px-3 py-2 tabular-nums">{fmt(row.decisionQuantity)}</td>
                          <td className="px-3 py-2 tabular-nums text-amber-700">{fmt(row.currentStockQuantity)}</td>
                          <td className="px-3 py-2 tabular-nums text-emerald-700">{fmt(row.reopenedQuantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">التوريد والمخزون</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-2.5">
                    <div className="text-muted-foreground text-xs">طلبات توريد مفتوحة</div>
                    <div className="font-bold text-lg tabular-nums">{fmt(sprCounts.open)}</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-muted-foreground text-xs">سلال مفتوحة</div>
                    <div className="font-bold text-lg tabular-nums">{fmt(sprCounts.openBasket)}</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-muted-foreground text-xs">سندات بانتظار الاعتماد</div>
                    <div className="font-bold text-lg tabular-nums text-amber-700">{fmt(rsiPendingCount)}</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-muted-foreground text-xs">منخفض المخزون</div>
                    <div className={`font-bold text-lg tabular-nums ${overview.lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {fmt(overview.lowStockCount)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canViewReplenishment && (
                    <Link to={path('/repair/parts-replenishment')}>
                      <Button size="sm" variant="outline">التوريد</Button>
                    </Link>
                  )}
                  {canViewSpareIssues && (
                    <Link to={path('/repair/spare-issues')}>
                      <Button size="sm" variant="outline">سندات الصرف</Button>
                    </Link>
                  )}
                  {canViewParts && (
                    <Link to={path('/repair/parts')}>
                      <Button size="sm" variant="outline">المخزون</Button>
                    </Link>
                  )}
                  {canManagePricing && (
                    <Link to={path('/manufacturing/materials')}>
                      <Button size="sm" variant="outline">التسعير (الماستر)</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">العملاء والعهدة والاستبدال</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  توزيع طلبات البورتال، متابعة عهدة الأجهزة، ومخزن غير القابل، واعتماد الاستبدال.
                </p>
                <div className="flex flex-wrap gap-2">
                  {canViewCustomerRequests && (
                    <Link to={path('/repair/customer-requests')}>
                      <Button size="sm" variant="outline">طلبات العملاء</Button>
                    </Link>
                  )}
                  {canViewCustody && (
                    <>
                      <Link to={path('/repair/custody-stock')}>
                        <Button size="sm" variant="outline">العهدة</Button>
                      </Link>
                      <Link to={path('/repair/custody-stock?stockType=unrepairable')}>
                        <Button size="sm" variant="outline">غير القابل</Button>
                      </Link>
                    </>
                  )}
                  {canViewReplacements && (
                    <Link to={path('/repair/replacements')}>
                      <Button size="sm" variant="outline">الاستبدال</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">الخزينة والإقفال الشهري</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-2.5">
                    <div className="text-muted-foreground text-xs">جلسات مفتوحة</div>
                    <div className={`font-bold text-lg tabular-nums ${openSessionsCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {fmt(openSessionsCount)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-muted-foreground text-xs">شهر {currentMonth}</div>
                    <div className="font-bold text-sm mt-1">
                      {fmt(monthCloseSummary.closedBranches)} مقفول / {fmt(monthCloseSummary.openBranches)} مفتوح
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  الإقفال الشهري يمنع تسجيل حركات جديدة على الفروع المقفولة حتى إعادة الفتح.
                </p>
                <div className="flex flex-wrap gap-2">
                  {canViewTreasury && (
                    <>
                      <Link to={path('/repair/treasury')}>
                        <Button size="sm" variant="outline">الخزينة اليومية</Button>
                      </Link>
                      <Link to={path('/repair/treasury-report')}>
                        <Button size="sm" variant="outline">التقرير الشهري</Button>
                      </Link>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">الجودة والأداء</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-2.5">
                    <div className="text-muted-foreground text-xs">شكاوى مفتوحة</div>
                    <div className={`font-bold text-lg tabular-nums ${openComplaintsCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {fmt(openComplaintsCount)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-muted-foreground text-xs">نسبة النجاح</div>
                    <div className="font-bold text-lg tabular-nums">{overview.successRate.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canViewComplaints && (
                    <Link to={path('/repair/complaints')}>
                      <Button size="sm" variant="outline">الشكاوى</Button>
                    </Link>
                  )}
                  {canViewTechKpis && (
                    <Link to={path('/repair/technician-kpis?period=month')}>
                      <Button size="sm" variant="outline">أداء الفنيين</Button>
                    </Link>
                  )}
                  {canViewCustomers && (
                    <Link to={path('/customers/kpi')}>
                      <Button size="sm" variant="outline">مؤشرات العملاء</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {rankedCards.map((card) => (
              <Card key={card.branch.id} className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span>{card.branch.name}</span>
                      {card.branch.isMain && <Badge>الفرع الرئيسي</Badge>}
                    </div>
                    <Badge variant={card.successRate >= 75 ? 'default' : 'secondary'}>
                      أداء {card.successRate.toFixed(0)}%
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div className="rounded-lg border p-2.5 bg-slate-50/70">
                      <div className="text-muted-foreground">إجمالي الطلبات</div>
                      <div className="font-bold tabular-nums">{fmt(card.totalJobs)}</div>
                    </div>
                    <div className="rounded-lg border p-2.5 bg-amber-50/60">
                      <div className="text-muted-foreground">طلبات مفتوحة</div>
                      <div className="font-bold tabular-nums">{fmt(card.openJobs)}</div>
                    </div>
                    <div className="rounded-lg border p-2.5 bg-indigo-50/60">
                      <div className="text-muted-foreground">جاهز للتسليم</div>
                      <div className="font-bold tabular-nums">{fmt(card.readyJobs)}</div>
                    </div>
                    <div className="rounded-lg border p-2.5 bg-emerald-50/60">
                      <div className="text-muted-foreground">طلبات منجزة</div>
                      <div className="font-bold tabular-nums">{fmt(card.deliveredJobs)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div className="rounded-lg border p-2.5">
                      <div className="text-muted-foreground">موافقة عميل</div>
                      <div className="font-bold tabular-nums text-violet-700">{fmt(card.waitingApproval)}</div>
                    </div>
                    <div className="rounded-lg border p-2.5">
                      <div className="text-muted-foreground">بانتظار قطع</div>
                      <div className="font-bold tabular-nums text-amber-700">{fmt(card.waitingParts)}</div>
                    </div>
                    <div className="rounded-lg border p-2.5">
                      <div className="text-muted-foreground">جاهز للصرف</div>
                      <div className="font-bold tabular-nums text-sky-700">{fmt(card.readyToIssueParts)}</div>
                    </div>
                    <div className="rounded-lg border p-2.5">
                      <div className="text-muted-foreground">متأخر</div>
                      <div className={`font-bold tabular-nums ${card.overdueJobs > 0 ? 'text-rose-600' : ''}`}>
                        {fmt(card.overdueJobs)}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <div className="rounded-lg border p-2.5">
                      <div className="text-muted-foreground">نسبة النجاح</div>
                      <div className="font-bold tabular-nums">{card.successRate.toFixed(1)}%</div>
                    </div>
                    <div className="rounded-lg border p-2.5">
                      <div className="text-muted-foreground">إيراد الصيانة</div>
                      <div className="font-bold text-emerald-600 tabular-nums">{fmt(card.revenue)}</div>
                    </div>
                    <div className="rounded-lg border p-2.5">
                      <div className="text-muted-foreground">مبيعات قطع الغيار</div>
                      <div className="font-bold text-sky-600 tabular-nums">{fmt(card.partsRevenue)}</div>
                    </div>
                    <div className="rounded-lg border p-2.5">
                      <div className="text-muted-foreground">الإجمالي التشغيلي</div>
                      <div className="font-bold text-emerald-700 tabular-nums">{fmt(card.totalRevenue)}</div>
                    </div>
                    <div className="rounded-lg border p-2.5">
                      <div className="text-muted-foreground">منخفض المخزون</div>
                      <div className={`font-bold tabular-nums ${card.lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {fmt(card.lowStockCount)}
                      </div>
                    </div>
                  </div>
                  {can('repair.finance.view') ? (
                    <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                      <div className="rounded-lg border p-2.5"><div className="text-muted-foreground">الإجمالي</div><div className="font-bold tabular-nums">{fmt(card.grossAmount)}</div></div>
                      <div className="rounded-lg border p-2.5"><div className="text-muted-foreground">الخصم</div><div className="font-bold text-rose-600 tabular-nums">{fmt(card.discountAmount)}</div></div>
                      <div className="rounded-lg border p-2.5"><div className="text-muted-foreground">الصافي</div><div className="font-bold text-indigo-600 tabular-nums">{fmt(card.netAmount)}</div></div>
                      <div className="rounded-lg border p-2.5"><div className="text-muted-foreground">المحصل</div><div className="font-bold text-emerald-600 tabular-nums">{fmt(card.paidAmount)}</div></div>
                      <div className="rounded-lg border p-2.5"><div className="text-muted-foreground">الرصيد</div><div className="font-bold text-amber-700 tabular-nums">{fmt(card.balanceDue)}</div></div>
                    </div>
                  ) : null}
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>نسبة النجاح (من الطلبات المنتهية)</span>
                      <span className="tabular-nums">{card.successRate.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{ width: `${Math.min(100, Math.max(0, card.successRate))}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
              <CardTitle className="text-base">ترتيب الفروع حسب الأداء</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={rankedCards.length === 0}
                onClick={() => {
                  const day = new Date().toISOString().slice(0, 10);
                  downloadUtf8Csv(
                    `repair-branches-ranking-${day}.csv`,
                    [
                      'الفرع',
                      'إجمالي الطلبات',
                      'تم التسليم',
                      'غير قابل للإصلاح',
                      'نسبة النجاح %',
                      'موافقة عميل',
                      'بانتظار قطع',
                      'متأخر',
                      'إيراد الصيانة',
                      'مبيعات قطع الغيار',
                      'الإجمالي التشغيلي',
                    ],
                    rankedCards.map((card) => [
                      card.branch.name || '',
                      card.totalJobs,
                      card.deliveredJobs,
                      card.unrepairableJobs,
                      Number(card.successRate.toFixed(2)),
                      card.waitingApproval,
                      card.waitingParts,
                      card.overdueJobs,
                      Number(card.revenue.toFixed(2)),
                      Number(card.partsRevenue.toFixed(2)),
                      Number(card.totalRevenue.toFixed(2)),
                    ]),
                  );
                }}
              >
                تصدير CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground border-b">
                    <tr>
                      <th className="text-right py-2 px-2 font-medium">الفرع</th>
                      <th className="text-right py-2 px-2 font-medium">الطلبات</th>
                      <th className="text-right py-2 px-2 font-medium">تم التسليم</th>
                      <th className="text-right py-2 px-2 font-medium">غير قابل للإصلاح</th>
                      <th className="text-right py-2 px-2 font-medium">نسبة النجاح</th>
                      <th className="text-right py-2 px-2 font-medium">موافقة / قطع / متأخر</th>
                      <th className="text-right py-2 px-2 font-medium">إيراد الصيانة</th>
                      <th className="text-right py-2 px-2 font-medium">المحصل</th>
                      <th className="text-right py-2 px-2 font-medium">الرصيد</th>
                      <th className="text-right py-2 px-2 font-medium">مبيعات قطع الغيار</th>
                      <th className="text-right py-2 px-2 font-medium">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedCards.map((card) => (
                      <tr key={`${card.branch.id}-row`} className="border-b last:border-b-0">
                        <td className="py-2 px-2 font-medium">{card.branch.name}</td>
                        <td className="py-2 px-2 tabular-nums">{fmt(card.totalJobs)}</td>
                        <td className="py-2 px-2 tabular-nums">{fmt(card.deliveredJobs)}</td>
                        <td className="py-2 px-2 tabular-nums">{fmt(card.unrepairableJobs)}</td>
                        <td className="py-2 px-2 tabular-nums">{card.successRate.toFixed(1)}%</td>
                        <td className="py-2 px-2 tabular-nums text-xs">
                          {fmt(card.waitingApproval)} / {fmt(card.waitingParts)} / {fmt(card.overdueJobs)}
                        </td>
                        <td className="py-2 px-2 text-emerald-600 tabular-nums">{fmt(card.revenue)}</td>
                        <td className="py-2 px-2 text-emerald-700 tabular-nums">{fmt(card.paidAmount)}</td>
                        <td className="py-2 px-2 text-amber-700 tabular-nums">{fmt(card.balanceDue)}</td>
                        <td className="py-2 px-2 text-sky-600 tabular-nums">{fmt(card.partsRevenue)}</td>
                        <td className="py-2 px-2 text-emerald-700 tabular-nums">{fmt(card.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default RepairAdminDashboard;
