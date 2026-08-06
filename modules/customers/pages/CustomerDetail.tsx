import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  Banknote,
  Building2,
  Copy,
  MapPin,
  NotebookPen,
  Phone,
  PhoneCall,
  ReceiptText,
  ShieldCheck,
  StickyNote,
  Upload,
  UserPlus,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
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
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { NESTED_TILE, SURFACE_CARD } from '@/src/components/erp/DetailPageChrome';
import { withTenantPath } from '@/lib/tenantPaths';
import { cn } from '@/lib/utils';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { formatNumber } from '@/utils/calculations';
import { toast } from 'sonner';
import { customerService } from '../services/customerService';
import { customerActivityService } from '../services/customerActivityService';
import { customerFinancialAnalyticsService } from '../services/customerFinancialAnalyticsService';
import { repairCustomerOperationsService } from '@/modules/repair/services/repairCustomerOperationsService';
import {
  CUSTOMER_FOLLOW_UP_LABELS,
  CUSTOMER_FOLLOW_UP_OPTIONS,
  CUSTOMER_SIZE_TIER_LABELS,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPE_OPTIONS,
  type Customer,
  type CustomerActivity,
  type CustomerActivityModule,
  type CustomerFollowUpStatus,
  type CustomerFinancialAnalytics,
  type CustomerSizeTier,
  type CustomerType,
} from '../types';

type ActivityFilter = 'all' | 'repair' | 'customers';
type FinancialTab = 'repairs' | 'warranty' | 'invoices' | 'payments';

const MODULE_LABELS: Record<string, string> = {
  customers: 'العملاء',
  repair: 'الصيانة',
};

const fmtMetric = (n: number | undefined) => (n == null ? '—' : formatNumber(n));
const fmtMoney = (n: unknown) => `${formatNumber(Number(n || 0))} ج.م`;

function sizeBadgeType(tier: CustomerSizeTier | undefined): 'info' | 'success' | 'warning' | 'muted' {
  if (tier === 'large') return 'success';
  if (tier === 'medium') return 'info';
  if (tier === 'small') return 'warning';
  return 'muted';
}

function followUpBadgeType(
  status: CustomerFollowUpStatus | undefined,
): 'warning' | 'success' | 'muted' {
  if (status === 'needs_call') return 'warning';
  if (status === 'followed_up') return 'success';
  return 'muted';
}

function activityVisual(activity: CustomerActivity): {
  Icon: LucideIcon;
  tone: string;
  dot: string;
} {
  const action = String(activity.action || '');
  if (action.startsWith('repair.')) {
    return {
      Icon: Wrench,
      tone: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
      dot: 'bg-sky-500',
    };
  }
  if (action === 'customer.created') {
    return {
      Icon: UserPlus,
      tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    };
  }
  if (action.includes('import') || action.includes('metrics')) {
    return {
      Icon: Upload,
      tone: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
      dot: 'bg-violet-500',
    };
  }
  if (action.includes('follow_up')) {
    return {
      Icon: PhoneCall,
      tone: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
      dot: 'bg-amber-500',
    };
  }
  return {
    Icon: Activity,
    tone: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-400',
  };
}

function DataRow({
  icon: Icon,
  label,
  children,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-1 py-2">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className={cn('text-sm font-medium text-foreground break-words', mono && 'tabular-nums')}>
          {children}
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  valueClassName,
  children,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex min-h-[88px] flex-col justify-between p-3', NESTED_TILE)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="space-y-1">
        <div
          className={cn(
            typeof value === 'string' || typeof value === 'number'
              ? 'text-lg font-semibold tabular-nums tracking-tight'
              : 'text-sm font-semibold',
            valueClassName,
          )}
        >
          {value}
        </div>
        {children}
        {hint ? <div className="text-[11px] text-muted-foreground line-clamp-2">{hint}</div> : null}
      </div>
    </div>
  );
}

export const CustomerDetail: React.FC = () => {
  const { tenantSlug, customerId } = useParams<{ tenantSlug?: string; customerId: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canEdit = can('customers.edit');
  const canManagePortalPin = canEdit || can('repair.customerPortal.manage');
  const canCreateRepair = can('repair.jobs.create');
  const user = useAppStore((s) => s.userProfile);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [financial, setFinancial] = useState<CustomerFinancialAnalytics | null>(null);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [financialError, setFinancialError] = useState('');
  const [financialFrom, setFinancialFrom] = useState('');
  const [financialTo, setFinancialTo] = useState('');
  const [financialTab, setFinancialTab] = useState<FinancialTab>('repairs');
  const [financialPage, setFinancialPage] = useState(1);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    code: '',
    type: 'consumer' as CustomerType,
    name: '',
    phone: '',
    address: '',
    notes: '',
    isActive: true,
  });

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [followUpStatus, setFollowUpStatus] = useState<CustomerFollowUpStatus>('none');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [portalPin, setPortalPin] = useState('');
  const [portalPinOpen, setPortalPinOpen] = useState(false);
  const [portalPinConfirmOpen, setPortalPinConfirmOpen] = useState(false);
  const [portalPinConfigured, setPortalPinConfigured] = useState<boolean | null>(null);
  const [portalPinSaving, setPortalPinSaving] = useState(false);

  const load = async () => {
    if (!customerId) return;
    setLoading(true);
    setError('');
    try {
      const [row, timeline, pinStatus] = await Promise.all([
        customerService.getById(customerId),
        customerActivityService.listForCustomer(customerId, 100),
        canManagePortalPin
          ? repairCustomerOperationsService.getPortalPinStatus(customerId).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!row) {
        setError('العميل غير موجود.');
        setCustomer(null);
        setActivities([]);
      } else {
        setCustomer(row);
        setActivities(timeline);
        setPortalPinConfigured(pinStatus?.configured ?? null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل العميل.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!customerId) return;
      setLoading(true);
      setError('');
      try {
        const [row, timeline] = await Promise.all([
          customerService.getById(customerId),
          customerActivityService.listForCustomer(customerId, 100),
        ]);
        if (cancelled) return;
        if (!row) {
          setError('العميل غير موجود.');
          setCustomer(null);
          setActivities([]);
        } else {
          setCustomer(row);
          setActivities(timeline);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'تعذر تحميل العميل.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    if (!customerId) return undefined;
    setFinancialLoading(true);
    setFinancialError('');
    void customerFinancialAnalyticsService.get(customerId, { from: financialFrom, to: financialTo })
      .then((result) => { if (!cancelled) setFinancial(result); })
      .catch((e: unknown) => {
        if (!cancelled) {
          setFinancial(null);
          setFinancialError(e instanceof Error ? e.message : 'تعذر تحميل التحليل المالي.');
        }
      })
      .finally(() => { if (!cancelled) setFinancialLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, financialFrom, financialTo]);

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return activities;
    return activities.filter((a) => a.module === activityFilter);
  }, [activities, activityFilter]);

  const activityCounts = useMemo(() => {
    let repair = 0;
    let customers = 0;
    for (const a of activities) {
      if (a.module === 'repair') repair += 1;
      else if (a.module === 'customers') customers += 1;
    }
    return { all: activities.length, repair, customers };
  }, [activities]);

  const financialDetailRows = useMemo(() => {
    if (!financial) return [] as Array<Record<string, unknown>>;
    if (financialTab === 'warranty') return financial.repairRows.filter((row) => Boolean(row.warranty));
    if (financialTab === 'repairs') return financial.repairRows;
    if (financialTab === 'invoices') return financial.invoiceRows;
    return financial.paymentRows;
  }, [financial, financialTab]);
  const financialPageSize = 15;
  const financialTotalPages = Math.max(1, Math.ceil(financialDetailRows.length / financialPageSize));
  const financialVisibleRows = financialDetailRows.slice(
    (Math.min(financialPage, financialTotalPages) - 1) * financialPageSize,
    Math.min(financialPage, financialTotalPages) * financialPageSize,
  );

  useEffect(() => { setFinancialPage(1); }, [financialTab, financialFrom, financialTo]);

  const openEdit = () => {
    if (!customer) return;
    setEditForm({
      code: customer.code,
      type: customer.type,
      name: customer.name,
      phone: customer.phone,
      address: customer.address || '',
      notes: customer.notes || '',
      isActive: customer.isActive !== false,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!customer?.id) return;
    setEditSaving(true);
    try {
      await customerService.update(customer.id, {
        code: editForm.code,
        type: editForm.type,
        name: editForm.name,
        phone: editForm.phone,
        address: editForm.address,
        notes: editForm.notes,
        isActive: editForm.isActive,
        updatedBy: String(user?.id || ''),
        updatedByName: String(user?.displayName || user?.email || 'مستخدم'),
      });
      toast.success('تم تحديث العميل.');
      setEditOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر حفظ العميل.');
    } finally {
      setEditSaving(false);
    }
  };

  const openFollowUp = () => {
    if (!customer) return;
    setFollowUpStatus(customer.followUpStatus || 'none');
    setFollowUpNotes(customer.followUpNotes || '');
    setFollowUpOpen(true);
  };

  const saveFollowUp = async () => {
    if (!customer?.id) return;
    setFollowUpSaving(true);
    try {
      await customerService.updateFollowUp(customer.id, {
        followUpStatus,
        followUpNotes,
        updatedBy: String(user?.id || ''),
        updatedByName: String(user?.displayName || user?.email || 'مستخدم'),
      });
      toast.success('تم تحديث المتابعة.');
      setFollowUpOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر تحديث المتابعة.');
    } finally {
      setFollowUpSaving(false);
    }
  };

  const copyPhone = async () => {
    const phone = String(customer?.phone || '').trim();
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success('تم نسخ رقم الموبايل.');
    } catch {
      toast.error('تعذر نسخ الرقم.');
    }
  };

  const generatePortalPin = async (confirmReset = false) => {
    if (!customer.id) return;
    setPortalPinSaving(true);
    try {
      const result = await repairCustomerOperationsService.generatePortalPin(customer.id, confirmReset);
      setPortalPin(result.pin);
      setPortalPinConfigured(true);
      setPortalPinConfirmOpen(false);
      setPortalPinOpen(true);
      toast.success(
        result.reset
          ? 'تمت إعادة تعيين PIN الثابت وإلغاء جلسات البورتال السابقة.'
          : 'تم إنشاء PIN ثابت للعميل. سيظل صالحًا حتى إعادة تعيينه يدويًا.',
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر إنشاء PIN للعميل.');
    } finally {
      setPortalPinSaving(false);
    }
  };

  const openNewRepairJob = () => {
    if (!customer?.id) return;
    navigate(withTenantPath(tenantSlug, '/repair/jobs/new'), {
      state: {
        callCenterPrefill: {
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address || '',
        },
      },
    });
  };

  if (!can('customers.view')) {
    return <div className="p-6 text-sm text-muted-foreground">ليس لديك صلاحية عرض العملاء.</div>;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-1" />
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="بطاقة العميل"
          subtitle="تعذر عرض البيانات"
          backAction={{ to: withTenantPath(tenantSlug, '/customers'), label: 'كل العملاء' }}
        />
        <Card className={cn(SURFACE_CARD)}>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-rose-700">{error || 'العميل غير موجود.'}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void load()}>
                إعادة المحاولة
              </Button>
              <Button asChild variant="outline">
                <Link to={withTenantPath(tenantSlug, '/customers')}>العودة للقائمة</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sizeTier = (customer.sizeTier || 'unclassified') as CustomerSizeTier;
  const followUp = (customer.followUpStatus || 'none') as CustomerFollowUpStatus;
  const balance = customer.balance;
  const balanceTone =
    balance == null
      ? 'text-muted-foreground'
      : balance > 0
        ? 'text-amber-700 dark:text-amber-400'
        : balance < 0
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-foreground';

  const filterChips: Array<{ key: ActivityFilter; label: string; count: number }> = [
    { key: 'all', label: 'الكل', count: activityCounts.all },
    { key: 'repair', label: 'صيانة', count: activityCounts.repair },
    { key: 'customers', label: 'عملاء', count: activityCounts.customers },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={customer.name}
        subtitle={`${customer.code} · ${CUSTOMER_TYPE_LABELS[customer.type]} · بطاقة ماستر وسجل حركات عبر الموديولات`}
        icon="user"
        backAction={{ to: withTenantPath(tenantSlug, '/customers'), label: 'كل العملاء' }}
        primaryAction={
          canEdit
            ? {
                label: 'تعديل',
                icon: 'edit',
                onClick: openEdit,
              }
            : undefined
        }
        secondaryAction={
          canCreateRepair
            ? {
                label: 'طلب صيانة',
                icon: 'add',
                onClick: openNewRepairJob,
              }
            : {
                label: 'مؤشرات العملاء',
                icon: 'bar_chart',
                onClick: () => navigate(withTenantPath(tenantSlug, '/customers/kpi')),
              }
        }
        moreActions={[
          {
            label: 'مؤشرات العملاء',
            icon: 'bar_chart',
            onClick: () => navigate(withTenantPath(tenantSlug, '/customers/kpi')),
            hidden: !canCreateRepair,
          },
          {
            label: 'تحديث المتابعة',
            icon: 'notifications_active',
            onClick: openFollowUp,
            hidden: !canEdit,
          },
          {
            label: portalPinSaving
              ? 'جاري حفظ PIN…'
              : portalPinConfigured === false
                ? 'إنشاء PIN ثابت'
                : 'إعادة تعيين PIN الثابت',
            icon: 'key',
            onClick: () => {
              if (portalPinConfigured === false) void generatePortalPin(false);
              else setPortalPinConfirmOpen(true);
            },
            hidden: !canManagePortalPin || portalPinSaving,
          },
          {
            label: 'كل العملاء',
            icon: 'search',
            onClick: () => navigate(withTenantPath(tenantSlug, '/customers')),
          },
        ]}
        extra={
          <StatusBadge
            type={customer.isActive !== false ? 'success' : 'muted'}
            label={customer.isActive !== false ? 'نشط' : 'غير نشط'}
            dot
          />
        }
      />

      <Dialog open={portalPinOpen} onOpenChange={setPortalPinOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>PIN بوابة العميل</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هذا هو PIN الثابت للعميل. سيستخدم نفس الرقم في كل مرة، ولن يتغير بانتهاء الجلسة أو بتسجيل الدخول.
            انسخه الآن لأنه لا يمكن استرجاعه بعد إغلاق النافذة.
          </p>
          <div className="rounded-lg border bg-muted/40 p-5 text-center font-mono text-3xl font-bold tracking-[0.35em]" dir="ltr">
            {portalPin}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(portalPin).then(() => toast.success('تم نسخ PIN.'))}>
              نسخ PIN
            </Button>
            <Button type="button" onClick={() => setPortalPinOpen(false)}>تم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={portalPinConfirmOpen} onOpenChange={setPortalPinConfirmOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إعادة تعيين PIN الثابت؟</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>العميل لديه PIN ثابت ومفعل بالفعل، ولا يحتاج إلى PIN جديد عند كل دخول.</p>
            <p className="font-medium text-rose-700">
              إعادة التعيين ستلغي الرقم الحالي فورًا، وتغلق جلسات البورتال السابقة، ثم تنشئ رقمًا ثابتًا جديدًا.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPortalPinConfirmOpen(false)}>
              إلغاء — الاحتفاظ بالـPIN الحالي
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={portalPinSaving}
              onClick={() => void generatePortalPin(true)}
            >
              {portalPinSaving ? 'جاري إعادة التعيين…' : 'نعم، إنشاء PIN جديد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="حجم الشغل"
          value={fmtMetric(customer.businessVolume)}
          hint={
            customer.metricsUpdatedAt
              ? `آخر تحديث: ${new Date(customer.metricsUpdatedAt).toLocaleDateString('ar-EG')}`
              : 'لم يُستورد بعد'
          }
        />
        <MetricTile
          label="الرصيد / المديونية"
          value={fmtMetric(balance)}
          valueClassName={balanceTone}
          hint={balance != null && balance > 0 ? 'يحتاج متابعة مالية' : undefined}
        />
        <MetricTile
          label="التصنيف"
          value={
            <StatusBadge type={sizeBadgeType(sizeTier)} label={CUSTOMER_SIZE_TIER_LABELS[sizeTier]} />
          }
        />
        <MetricTile
          label="المتابعة"
          value={
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge type={followUpBadgeType(followUp)} label={CUSTOMER_FOLLOW_UP_LABELS[followUp]} />
              {canEdit ? (
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={openFollowUp}>
                  تحديث
                </Button>
              ) : null}
            </div>
          }
          hint={
            customer.followUpNotes
              ? customer.followUpNotes.length > 56
                ? `${customer.followUpNotes.slice(0, 56)}…`
                : customer.followUpNotes
              : undefined
          }
        />
      </div>

      <Card className={cn(SURFACE_CARD)}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">التحليل المالي للعميل</CardTitle>
              <CardDescription>الصيانة والضمان وفواتير البضاعة من بداية التعامل أو خلال الفترة المحددة.</CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-xs">من</Label>
                <Input type="date" className="mt-1 h-9 w-[150px]" value={financialFrom} onChange={(e) => setFinancialFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">إلى</Label>
                <Input type="date" className="mt-1 h-9 w-[150px]" value={financialTo} onChange={(e) => setFinancialTo(e.target.value)} />
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => {
                const year = new Date().getFullYear();
                setFinancialFrom(`${year}-01-01`);
                setFinancialTo(`${year}-12-31`);
              }}>السنة الحالية</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setFinancialFrom(''); setFinancialTo(''); }}>كل التاريخ</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {financialError ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{financialError}</div> : null}
          {financialLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
          ) : financial ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile label="إجمالي ما دفعه العميل" value={fmtMoney(financial.summary.totalCustomerPaid)} hint="صيانة + فواتير بضاعة مرحّلة" valueClassName="text-emerald-700" />
                <MetricTile label="مدفوعات الصيانة" value={fmtMoney(financial.summary.repairPaid)} hint={`${financial.summary.repairJobs} طلب صيانة`} />
                <MetricTile label="صافي البضاعة المحصل" value={fmtMoney(financial.summary.salesNetPaid)} hint={`${financial.summary.salesInvoices} فاتورة مرحّلة`} />
                <MetricTile label="متبقي الصيانة" value={fmtMoney(financial.summary.repairBalanceDue)} valueClassName={financial.summary.repairBalanceDue > 0 ? 'text-amber-700' : 'text-foreground'} />
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <div className={cn('space-y-2 p-3', NESTED_TILE)}>
                  <div className="flex items-center gap-2 font-semibold"><Banknote className="size-4 text-primary" />الصيانة</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>الإجمالي<br /><strong>{fmtMoney(financial.summary.repairGross)}</strong></div>
                    <div>الخصومات<br /><strong>{fmtMoney(financial.summary.repairDiscounts)}</strong></div>
                    <div>داخل الضمان<br /><strong>{financial.summary.warrantyJobs}</strong></div>
                    <div>خارج الضمان<br /><strong>{financial.summary.outOfWarrantyJobs}</strong></div>
                  </div>
                </div>
                <div className={cn('space-y-2 p-3', NESTED_TILE)}>
                  <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-violet-600" />الضمان</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>القيمة المعفاة<br /><strong>{fmtMoney(financial.summary.warrantyAllowances)}</strong></div>
                    <div>التكلفة الفعلية<br /><strong>{fmtMoney(financial.summary.warrantyActualCost)}</strong></div>
                    <div>تكلفة القطع<br /><strong>{fmtMoney(financial.summary.warrantyPartsCost)}</strong></div>
                    <div>تكلفة الخدمات<br /><strong>{fmtMoney(financial.summary.warrantyServiceCost)}</strong></div>
                  </div>
                  {financial.summary.legacyIncompleteWarrantyJobs > 0 ? <p className="text-xs text-amber-700">{financial.summary.legacyIncompleteWarrantyJobs} طلب ضمان قديم به قيم غير متاحة ولم يتم تخمينها.</p> : null}
                </div>
                <div className={cn('space-y-2 p-3', NESTED_TILE)}>
                  <div className="flex items-center gap-2 font-semibold"><ReceiptText className="size-4 text-sky-600" />فواتير البضاعة</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>قبل الخصم<br /><strong>{fmtMoney(financial.summary.salesGross)}</strong></div>
                    <div>الخصومات<br /><strong>{fmtMoney(financial.summary.salesDiscounts)}</strong></div>
                    <div>الكمية<br /><strong>{formatNumber(financial.summary.salesQuantity)}</strong></div>
                    <div>خصم كامل<br /><strong>{financial.summary.fullDiscountInvoices}</strong></div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-b pb-3">
                {([
                  ['repairs', 'طلبات الصيانة'], ['warranty', 'تحليل الضمان'], ['invoices', 'فواتير البضاعة'], ['payments', 'الدفعات'],
                ] as Array<[FinancialTab, string]>).map(([key, label]) => (
                  <Button key={key} type="button" size="sm" variant={financialTab === key ? 'default' : 'outline'} onClick={() => setFinancialTab(key)}>{label}</Button>
                ))}
              </div>

              <div className="overflow-x-auto">
                {financialTab === 'repairs' || financialTab === 'warranty' ? (
                  <table className="w-full min-w-[980px] text-sm">
                    <thead><tr className="border-b text-right text-xs text-muted-foreground"><th className="p-2">الطلب</th><th className="p-2">التاريخ</th><th className="p-2">المنتجات والبنود</th><th className="p-2">الضمان</th><th className="p-2">الإجمالي</th><th className="p-2">الخصم/الإعفاء</th><th className="p-2">المدفوع</th><th className="p-2">المتبقي</th><th className="p-2">التكلفة</th></tr></thead>
                    <tbody>
                      {financialVisibleRows.map((raw) => {
                        const services = Array.isArray(raw.serviceLines) ? raw.serviceLines as Array<Record<string, unknown>> : [];
                        const parts = Array.isArray(raw.partLines) ? raw.partLines as Array<Record<string, unknown>> : [];
                        const partsUsed = Array.isArray(raw.partsUsed) ? raw.partsUsed as Array<Record<string, unknown>> : [];
                        return <tr key={String(raw.id)} className="border-b align-top">
                          <td className="p-2"><Link className="font-medium text-primary hover:underline" to={withTenantPath(tenantSlug, `/repair/jobs/${String(raw.id)}`)}>{String(raw.receiptNo)}</Link><div className="text-xs text-muted-foreground">{String(raw.status)}</div></td>
                          <td className="p-2 whitespace-nowrap">{String(raw.createdAt || '').slice(0, 10) || '—'}</td>
                          <td className="p-2"><div>{services.map((r) => `${String(r.name)} × ${Number(r.quantity || 0)} (قيمة ${fmtMoney(r.lineTotal)}${raw.warranty ? ` · تكلفة ${fmtMoney(r.internalCostTotal)}` : ''})`).join('، ') || '—'}</div>{parts.length ? <div className="text-xs text-muted-foreground">قطع: {parts.map((r) => `${String(r.name)} × ${Number(r.quantity || 0)} (قيمة ${fmtMoney(r.lineTotal)})`).join('، ')}</div> : null}{raw.warranty && partsUsed.length ? <div className="text-xs text-violet-700">تكلفة فعلية للقطع: {partsUsed.map((r) => `${String(r.partName || 'قطعة')} ${fmtMoney(r.totalCostSnapshot)}`).join('، ')}</div> : null}</td>
                          <td className="p-2">{raw.warranty ? 'داخل الضمان' : 'خارج الضمان'}{raw.legacyIncomplete ? <div className="text-xs text-amber-700">بيانات قديمة ناقصة</div> : null}</td>
                          <td className="p-2 whitespace-nowrap">{fmtMoney(raw.grossAmount)}</td><td className="p-2 whitespace-nowrap">{fmtMoney(raw.warranty ? raw.warrantyAllowance : raw.discountAmount)}</td><td className="p-2 whitespace-nowrap">{fmtMoney(raw.paidAmount)}</td><td className="p-2 whitespace-nowrap">{fmtMoney(raw.balanceDue)}</td><td className="p-2 whitespace-nowrap">{raw.warranty ? fmtMoney(raw.warrantyActualCost) : '—'}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                ) : financialTab === 'invoices' ? (
                  <table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-right text-xs text-muted-foreground"><th className="p-2">الفاتورة</th><th className="p-2">التاريخ</th><th className="p-2">البنود</th><th className="p-2">الحالة</th><th className="p-2">الإجمالي</th><th className="p-2">الخصم</th><th className="p-2">الصافي</th></tr></thead><tbody>
                    {financialVisibleRows.map((raw) => { const lines = Array.isArray(raw.lines) ? raw.lines as Array<Record<string, unknown>> : []; return <tr key={String(raw.id)} className="border-b align-top"><td className="p-2"><Link className="font-medium text-primary hover:underline" to={withTenantPath(tenantSlug, `/repair/sales-invoice?invoice=${encodeURIComponent(String(raw.invoiceNo))}`)}>{String(raw.invoiceNo)}</Link></td><td className="p-2">{String(raw.postedAt || raw.createdAt || '').slice(0, 10)}</td><td className="p-2">{lines.map((r) => `${String(r.partName || r.name)} × ${Number(r.quantity || 0)}`).join('، ')}</td><td className="p-2">{String(raw.status)}{raw.fullDiscount ? <div className="text-xs text-violet-700">خصم كامل</div> : null}</td><td className="p-2">{fmtMoney(raw.grossAmount)}</td><td className="p-2">{fmtMoney(raw.discountAmount)}</td><td className="p-2">{fmtMoney(raw.netAmount)}</td></tr>; })}
                  </tbody></table>
                ) : (
                  <table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b text-right text-xs text-muted-foreground"><th className="p-2">رقم الدفعة</th><th className="p-2">طلب الصيانة</th><th className="p-2">التاريخ</th><th className="p-2">الوسيلة</th><th className="p-2">المبلغ</th><th className="p-2">الحالة</th></tr></thead><tbody>
                    {financialVisibleRows.map((raw) => <tr key={String(raw.id)} className="border-b"><td className="p-2 font-medium">{String(raw.paymentNo)}</td><td className="p-2"><Link className="text-primary hover:underline" to={withTenantPath(tenantSlug, `/repair/jobs/${String(raw.jobId)}`)}>فتح الطلب</Link></td><td className="p-2">{String(raw.createdAt || '').slice(0, 10)}</td><td className="p-2">{String(raw.method)}</td><td className="p-2">{fmtMoney(raw.amount)}</td><td className="p-2">{String(raw.status)}</td></tr>)}
                  </tbody></table>
                )}
              </div>
              {financialDetailRows.length > financialPageSize ? (
                <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span>{financialDetailRows.length} سجل · صفحة {Math.min(financialPage, financialTotalPages)} من {financialTotalPages}</span>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={financialPage <= 1} onClick={() => setFinancialPage((p) => Math.max(1, p - 1))}>السابق</Button>
                    <Button type="button" size="sm" variant="outline" disabled={financialPage >= financialTotalPages} onClick={() => setFinancialPage((p) => Math.min(financialTotalPages, p + 1))}>التالي</Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={cn('lg:col-span-1', SURFACE_CARD)}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">بيانات الماستر</CardTitle>
            <CardDescription>مصدر الحقيقة لبيانات العميل</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 divide-y divide-border/70">
            <DataRow icon={Building2} label="الكود" mono>
              {customer.code}
            </DataRow>
            <DataRow icon={UserPlus} label="النوع">
              {CUSTOMER_TYPE_LABELS[customer.type]}
            </DataRow>
            <DataRow icon={Phone} label="الموبايل" mono>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`tel:${customer.phone}`}
                  className="text-primary hover:underline tabular-nums"
                  dir="ltr"
                >
                  {customer.phone}
                </a>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="نسخ الموبايل"
                  onClick={() => void copyPhone()}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </DataRow>
            <DataRow icon={MapPin} label="العنوان">
              {customer.address?.trim() || (
                <span className="font-normal text-muted-foreground">لا يوجد عنوان</span>
              )}
            </DataRow>
            <DataRow icon={StickyNote} label="ملاحظات">
              {customer.notes?.trim() ? (
                <span className="whitespace-pre-wrap font-normal">{customer.notes}</span>
              ) : (
                <span className="font-normal text-muted-foreground">بدون ملاحظات</span>
              )}
            </DataRow>
            {customer.followUpNotes ? (
              <DataRow icon={NotebookPen} label="ملاحظات المتابعة">
                <span className="whitespace-pre-wrap font-normal">{customer.followUpNotes}</span>
              </DataRow>
            ) : null}
            <div className="pt-3 text-[11px] text-muted-foreground tabular-nums">
              أُنشئ:{' '}
              {customer.createdAt ? new Date(customer.createdAt).toLocaleString('ar-EG') : '—'}
              {customer.createdByName ? ` · ${customer.createdByName}` : ''}
              <br />
              آخر تحديث:{' '}
              {customer.updatedAt ? new Date(customer.updatedAt).toLocaleString('ar-EG') : '—'}
              {customer.updatedByName ? ` · ${customer.updatedByName}` : ''}
            </div>
          </CardContent>
        </Card>

        <Card className={cn('lg:col-span-2', SURFACE_CARD)}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">سجل الحركات</CardTitle>
                <CardDescription>
                  أحداث الصيانة والعملاء المرتبطة بهذا الملف — الأحدث أولاً.
                </CardDescription>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-700 dark:bg-muted dark:text-muted-foreground">
                {activityCounts.all} حركة
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2" role="tablist" aria-label="فلتر الحركات">
              {filterChips.map((chip) => {
                const active = activityFilter === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActivityFilter(chip.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/60',
                    )}
                  >
                    {chip.label}
                    <span className="tabular-nums opacity-80">{chip.count}</span>
                  </button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent>
            {filteredActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-slate-50/80 px-4 py-12 text-center dark:bg-muted/30">
                <Activity className="size-8 text-muted-foreground/70" aria-hidden />
                <p className="text-sm font-medium text-foreground">
                  {activities.length === 0 ? 'لا توجد حركات مسجّلة بعد' : 'لا نتائج لهذا الفلتر'}
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  {activities.length === 0
                    ? 'عند إنشاء طلب صيانة أو تحديث بيانات العميل ستظهر الأحداث هنا تلقائياً.'
                    : 'جرّب فلتر «الكل» لعرض كل الحركات.'}
                </p>
                {activities.length === 0 && canCreateRepair ? (
                  <Button type="button" size="sm" className="mt-2" onClick={openNewRepairJob}>
                    تسجيل طلب صيانة
                  </Button>
                ) : null}
              </div>
            ) : (
              <ol className="relative space-y-0">
                {filteredActivities.map((activity, index) => {
                  const { Icon, tone, dot } = activityVisual(activity);
                  const moduleLabel =
                    MODULE_LABELS[activity.module as CustomerActivityModule] || activity.module;
                  const isLast = index === filteredActivities.length - 1;
                  return (
                    <li key={activity.id || `${activity.action}-${activity.at}-${index}`} className="relative flex gap-3 pb-5">
                      {!isLast ? (
                        <span
                          className="absolute start-[1.15rem] top-9 bottom-0 w-px bg-border"
                          aria-hidden
                        />
                      ) : null}
                      <span
                        className={cn(
                          'relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-xl',
                          tone,
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        <span className={cn('absolute -end-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background', dot)} />
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl border bg-slate-50/50 px-3 py-2.5 dark:bg-muted/25">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <time className="tabular-nums" dateTime={activity.at}>
                            {activity.at ? new Date(activity.at).toLocaleString('ar-EG') : '—'}
                          </time>
                          <span aria-hidden>·</span>
                          <span>{moduleLabel}</span>
                          {activity.actorName ? (
                            <>
                              <span aria-hidden>·</span>
                              <span>{activity.actorName}</span>
                            </>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm font-medium text-foreground">{activity.title}</div>
                        {activity.summary ? (
                          <div className="mt-0.5 text-sm text-muted-foreground">{activity.summary}</div>
                        ) : null}
                        {activity.referenceLabel ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-md bg-background px-2 py-0.5 text-muted-foreground ring-1 ring-border">
                              {activity.referenceLabel}
                            </span>
                            {activity.referenceId && activity.module === 'repair' ? (
                              <Link
                                className="font-medium text-primary hover:underline"
                                to={activity.referenceType === 'repair_sales_invoice'
                                  ? withTenantPath(tenantSlug, `/repair/sales-invoice?invoice=${encodeURIComponent(activity.referenceLabel || activity.referenceId)}`)
                                  : withTenantPath(tenantSlug, `/repair/jobs/${activity.referenceId}`)}
                              >
                                {activity.referenceType === 'repair_sales_invoice' ? 'فتح الفاتورة' : 'فتح الطلب'}
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل عميل</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>النوع</Label>
              <Select
                value={editForm.type}
                onValueChange={(v) => setEditForm((p) => ({ ...p, type: v as CustomerType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الكود</Label>
              <Input
                value={editForm.code}
                onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))}
              />
            </div>
            <div>
              <Label>الاسم</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>الموبايل</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label>العنوان</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div>
              <Label>الحالة</Label>
              <Select
                value={editForm.isActive ? 'active' : 'inactive'}
                onValueChange={(v) => setEditForm((p) => ({ ...p, isActive: v === 'active' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="inactive">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" disabled={editSaving} onClick={() => void saveEdit()}>
              {editSaving ? 'جاري الحفظ…' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحديث المتابعة</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>حالة المتابعة</Label>
              <Select
                value={followUpStatus}
                onValueChange={(v) => setFollowUpStatus(v as CustomerFollowUpStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_FOLLOW_UP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ملاحظات المتابعة</Label>
              <Input
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder="اختياري"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFollowUpOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" disabled={followUpSaving} onClick={() => void saveFollowUp()}>
              {followUpSaving ? 'جاري الحفظ…' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
