import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { KPICard } from '@/src/components/erp/KPICard';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { formatNumber } from '@/utils/calculations';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { ImportCustomerMetricsModal } from '../components/ImportCustomerMetricsModal';
import type { ParsedCustomerMetricsRow } from '../lib/importCustomerMetricsSheet';
import { customerService } from '../services/customerService';
import {
  toCustomerListLoadErrorMessage,
  waitForTenantId,
} from '../lib/customerListLoadError';
import {
  CUSTOMER_FOLLOW_UP_LABELS,
  CUSTOMER_FOLLOW_UP_OPTIONS,
  CUSTOMER_SIZE_TIER_LABELS,
  CUSTOMER_SIZE_TIER_OPTIONS,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPE_OPTIONS,
  type Customer,
  type CustomerFollowUpStatus,
  type CustomerSizeTier,
} from '../types';

const PAGE_SIZE = 20;

const fmtMoney = (n: number | undefined) =>
  n == null ? '—' : formatNumber(n);

function followUpBadgeType(
  status: CustomerFollowUpStatus | undefined,
): 'warning' | 'success' | 'muted' {
  if (status === 'needs_call') return 'warning';
  if (status === 'followed_up') return 'success';
  return 'muted';
}

function sizeBadgeType(tier: CustomerSizeTier | undefined): 'info' | 'success' | 'warning' | 'muted' {
  if (tier === 'large') return 'success';
  if (tier === 'medium') return 'info';
  if (tier === 'small') return 'warning';
  return 'muted';
}

export const CustomersKPI: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const canEdit = can('customers.edit');
  const canImport = can('customers.import');
  const user = useAppStore((s) => s.userProfile);

  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [followUpFilter, setFollowUpFilter] = useState('all');
  const [metricsFilter, setMetricsFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<Customer | null>(null);
  const [followUpStatus, setFollowUpStatus] = useState<CustomerFollowUpStatus>('none');
  const [followUpNotes, setFollowUpNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const tenantId = await waitForTenantId();
      if (!tenantId) {
        toast.error(toCustomerListLoadErrorMessage(new Error('Tenant context not initialised')));
        setRows([]);
        return;
      }
      const list = await customerService.listAll({ includeInactive: true });
      setRows(list);
    } catch (error: unknown) {
      toast.error(toCustomerListLoadErrorMessage(error, 'تعذر تحميل مؤشرات العملاء.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, sizeFilter, followUpFilter, metricsFilter]);

  const filtered = useMemo(() => {
    let list = [...rows];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const digits = q.replace(/\D/g, '');
      list = list.filter((c) => {
        const blob = `${c.code} ${c.name} ${c.phone} ${c.phoneDigits}`.toLowerCase();
        return blob.includes(q) || (digits.length >= 3 && c.phoneDigits.includes(digits));
      });
    }
    if (typeFilter !== 'all') list = list.filter((c) => c.type === typeFilter);
    if (sizeFilter !== 'all') {
      list = list.filter((c) => (c.sizeTier || 'unclassified') === sizeFilter);
    }
    if (followUpFilter !== 'all') {
      list = list.filter((c) => (c.followUpStatus || 'none') === followUpFilter);
    }
    if (metricsFilter === 'with_volume') {
      list = list.filter((c) => c.businessVolume != null);
    } else if (metricsFilter === 'with_balance') {
      list = list.filter((c) => c.balance != null);
    } else if (metricsFilter === 'missing') {
      list = list.filter((c) => c.businessVolume == null && c.balance == null);
    }
    return list;
  }, [rows, search, typeFilter, sizeFilter, followUpFilter, metricsFilter]);

  const kpis = useMemo(() => {
    const active = rows.filter((c) => c.isActive !== false);
    let totalVolume = 0;
    let totalBalance = 0;
    let needsCall = 0;
    let large = 0;
    let medium = 0;
    let small = 0;
    for (const c of rows) {
      if (c.businessVolume != null) totalVolume += c.businessVolume;
      if (c.balance != null) totalBalance += c.balance;
      if (c.followUpStatus === 'needs_call') needsCall += 1;
      const tier = c.sizeTier || 'unclassified';
      if (tier === 'large') large += 1;
      else if (tier === 'medium') medium += 1;
      else if (tier === 'small') small += 1;
    }
    return {
      activeCount: active.length,
      totalVolume,
      totalBalance,
      needsCall,
      large,
      medium,
      small,
    };
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openFollowUp = (customer: Customer) => {
    setFollowUpTarget(customer);
    setFollowUpStatus(customer.followUpStatus || 'none');
    setFollowUpNotes(customer.followUpNotes || '');
    setFollowUpOpen(true);
  };

  const saveFollowUp = async () => {
    if (!followUpTarget?.id) return;
    setFollowUpSaving(true);
    try {
      await customerService.updateFollowUp(followUpTarget.id, {
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

  const runMetricsImport = async (readyRows: ParsedCustomerMetricsRow[]) => {
    setImporting(true);
    setImportProgress({ done: 0, total: readyRows.length });
    const actor = {
      updatedBy: String(user?.id || ''),
      updatedByName: String(user?.displayName || user?.email || 'مستخدم'),
    };
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < readyRows.length; i += 1) {
      const row = readyRows[i];
      try {
        if (row.businessVolume == null || row.balance == null) {
          failed += 1;
        } else {
          await customerService.applyMetricsByCode(row.code, {
            businessVolume: row.businessVolume,
            balance: row.balance,
            ...actor,
          });
          ok += 1;
        }
      } catch {
        failed += 1;
      }
      setImportProgress({ done: i + 1, total: readyRows.length });
    }
    setImporting(false);
    setImportOpen(false);
    if (failed > 0) {
      toast.warning(`تم تحديث ${ok} عميل، وفشل ${failed}.`);
    } else {
      toast.success(`تم تحديث مؤشرات ${ok} عميل.`);
    }
    await load();
  };

  if (!can('customers.view')) {
    return <div className="p-6 text-sm text-muted-foreground">ليس لديك صلاحية عرض العملاء.</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="مؤشرات العملاء"
        subtitle="حجم الشغل والرصيد من الشيت — تصنيف تلقائي ومتابعة يدوية"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              تحديث
            </Button>
            {canImport && (
              <Button type="button" onClick={() => setImportOpen(true)} disabled={importing}>
                استيراد مؤشرات
              </Button>
            )}
            <Button type="button" variant="outline" asChild>
              <Link to={withTenantPath(tenantSlug, '/customers')}>سجل العملاء</Link>
            </Button>
          </div>
        }
      />

      {importing && (
        <p className="text-sm text-muted-foreground tabular-nums">
          جاري الاستيراد… {importProgress.done} / {importProgress.total}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <KPICard
          label="عملاء نشطون"
          value={formatNumber(kpis.activeCount)}
          color="indigo"
          iconType="metric"
          loading={loading}
        />
        <KPICard
          label="إجمالي حجم الشغل"
          value={formatNumber(kpis.totalVolume)}
          color="green"
          iconType="trend"
          loading={loading}
        />
        <KPICard
          label="إجمالي الأرصدة"
          value={formatNumber(kpis.totalBalance)}
          color={kpis.totalBalance < 0 ? 'red' : 'amber'}
          iconType="money"
          loading={loading}
        />
        <KPICard
          label="يحتاج اتصال"
          value={formatNumber(kpis.needsCall)}
          color="amber"
          iconType="metric"
          loading={loading}
        />
        <KPICard
          label="توزيع الحجم"
          value={`${kpis.large} / ${kpis.medium} / ${kpis.small}`}
          subValue="كبير / متوسط / صغير"
          color="gray"
          iconType="metric"
          loading={loading}
        />
      </div>

      <div className="rounded-xl border bg-[var(--color-card)] overflow-hidden">
        <div className="p-3 border-b">
          <SmartFilterBar
            pageId="customers-kpi"
            searchPlaceholder="بحث بالكود / الاسم / الموبايل…"
            searchValue={search}
            onSearchChange={setSearch}
            quickFilters={[
              {
                key: 'type',
                placeholder: 'كل الأنواع',
                options: CUSTOMER_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              },
              {
                key: 'size',
                placeholder: 'كل التصنيفات',
                options: CUSTOMER_SIZE_TIER_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                })),
              },
              {
                key: 'followUp',
                placeholder: 'كل المتابعات',
                options: CUSTOMER_FOLLOW_UP_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                })),
              },
              {
                key: 'metrics',
                placeholder: 'كل المؤشرات',
                options: [
                  { value: 'with_volume', label: 'لديه حجم شغل' },
                  { value: 'with_balance', label: 'لديه رصيد' },
                  { value: 'missing', label: 'بدون مؤشرات' },
                ],
              },
            ]}
            quickFilterValues={{
              type: typeFilter,
              size: sizeFilter,
              followUp: followUpFilter,
              metrics: metricsFilter,
            }}
            onQuickFilterChange={(key, value) => {
              if (key === 'type') setTypeFilter(value);
              if (key === 'size') setSizeFilter(value);
              if (key === 'followUp') setFollowUpFilter(value);
              if (key === 'metrics') setMetricsFilter(value);
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="erp-table w-full">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الكود</th>
                <th className="erp-th">الاسم</th>
                <th className="erp-th">النوع</th>
                <th className="erp-th">الهاتف</th>
                <th className="erp-th">حجم الشغل</th>
                <th className="erp-th">التصنيف</th>
                <th className="erp-th">الرصيد</th>
                <th className="erp-th">المتابعة</th>
                <th className="erp-th">آخر تحديث</th>
                <th className="erp-th">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={10} className="h-10 animate-pulse bg-muted/40" />
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">
                    لا توجد نتائج مطابقة للفلاتر.
                  </td>
                </tr>
              ) : (
                paged.map((c) => (
                  <tr key={c.id}>
                    <td className="tabular-nums font-medium">
                      <Link
                        className="text-primary hover:underline"
                        to={withTenantPath(tenantSlug, `/customers/${c.id}`)}
                      >
                        {c.code}
                      </Link>
                    </td>
                    <td>{c.name}</td>
                    <td>{CUSTOMER_TYPE_LABELS[c.type]}</td>
                    <td className="tabular-nums">{c.phone}</td>
                    <td className="tabular-nums">{fmtMoney(c.businessVolume)}</td>
                    <td>
                      <StatusBadge
                        type={sizeBadgeType(c.sizeTier)}
                        label={CUSTOMER_SIZE_TIER_LABELS[c.sizeTier || 'unclassified']}
                      />
                    </td>
                    <td className="tabular-nums">{fmtMoney(c.balance)}</td>
                    <td>
                      <StatusBadge
                        type={followUpBadgeType(c.followUpStatus)}
                        label={CUSTOMER_FOLLOW_UP_LABELS[c.followUpStatus || 'none']}
                      />
                    </td>
                    <td className="text-xs tabular-nums text-muted-foreground">
                      {c.metricsUpdatedAt
                        ? new Date(c.metricsUpdatedAt).toLocaleString('ar-EG')
                        : '—'}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {canEdit && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => openFollowUp(c)}
                            aria-label="تعديل المتابعة"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button type="button" size="sm" variant="outline" asChild>
                          <Link to={withTenantPath(tenantSlug, `/customers/${c.id}`)}>تفاصيل</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          itemLabel="عميل"
          onPageChange={setPage}
        />
      </div>

      <ImportCustomerMetricsModal
        open={importOpen}
        onClose={() => !importing && setImportOpen(false)}
        confirming={importing}
        loadExistingByCode={async () => {
          const list = await customerService.listAll({ includeInactive: true });
          const map = new Map<string, Customer>();
          for (const c of list) {
            if (c.code) map.set(c.code, c);
          }
          return map;
        }}
        onConfirm={runMetricsImport}
      />

      <Dialog open={followUpOpen} onOpenChange={(v) => !v && !followUpSaving && setFollowUpOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              متابعة العميل
              {followUpTarget ? ` — ${followUpTarget.code}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>حالة المتابعة</Label>
              <Select
                value={followUpStatus}
                onValueChange={(v) => setFollowUpStatus(v as CustomerFollowUpStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_FOLLOW_UP_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                rows={3}
                placeholder="ملاحظات المتابعة…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={followUpSaving}
              onClick={() => setFollowUpOpen(false)}
            >
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
