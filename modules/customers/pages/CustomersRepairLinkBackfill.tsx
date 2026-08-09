import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '@/components/ui/button';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import { customerService } from '../services/customerService';
import { customerActivityService } from '../services/customerActivityService';
import { toCustomerListLoadErrorMessage, waitForTenantId } from '../lib/customerListLoadError';
import {
  planRepairJobCustomerLinks,
  summarizeRepairJobCustomerLinkPlan,
  type RepairJobCustomerLinkPlan,
} from '../lib/linkRepairJobsByPhone';
import { repairJobService } from '@/modules/repair/services/repairJobService';

type Step = 'idle' | 'scanning' | 'preview' | 'applying' | 'done';

const STATUS_LABEL: Record<RepairJobCustomerLinkPlan['status'], string> = {
  link: 'سيتم الربط',
  skip_already_linked: 'مربوط',
  skip_no_phone: 'هاتف ناقص',
  skip_no_match: 'بدون مطابقة',
  skip_ambiguous: 'تعارض',
};

export const CustomersRepairLinkBackfill: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile);
  const [step, setStep] = useState<Step>('idle');
  const [plans, setPlans] = useState<RepairJobCustomerLinkPlan[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ linked: 0, failed: 0 });

  const summary = useMemo(() => summarizeRepairJobCustomerLinkPlan(plans), [plans]);
  const linkRows = useMemo(() => plans.filter((p) => p.status === 'link'), [plans]);

  if (!can('customers.edit')) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        ليس لديك صلاحية ربط طلبات الصيانة بالعملاء.
      </div>
    );
  }

  const scan = async () => {
    setStep('scanning');
    try {
      const tenantId = await waitForTenantId();
      if (!tenantId) {
        setStep('idle');
        toast.error(toCustomerListLoadErrorMessage(new Error('Tenant context not initialised')));
        return;
      }
      const [jobs, customers] = await Promise.all([
        repairJobService.listAllBranches(),
        customerService.listAll({ includeInactive: true }),
      ]);
      const unlinkedOrAll = jobs.filter((j) => j.id);
      const nextPlans = planRepairJobCustomerLinks(unlinkedOrAll, customers);
      setPlans(nextPlans);
      setStep('preview');
      const ready = nextPlans.filter((p) => p.status === 'link').length;
      toast.success(`تم المسح: ${ready} طلب جاهز للربط من أصل ${nextPlans.length}.`);
    } catch (e: unknown) {
      setStep('idle');
      toast.error(toCustomerListLoadErrorMessage(e, e instanceof Error ? e.message : 'تعذر مسح الطلبات.'));
    }
  };

  const apply = async () => {
    if (linkRows.length === 0) {
      toast.error('لا توجد صفوف للربط.');
      return;
    }
    setStep('applying');
    setProgress({ done: 0, total: linkRows.length });
    const actor = {
      userId: String(user?.id || ''),
      userName: String(user?.displayName || user?.email || 'مستخدم'),
    };
    let linked = 0;
    let failed = 0;
    const customers = await customerService.listAll({ includeInactive: true });
    const byId = new Map(customers.map((c) => [String(c.id), c]));

    for (let i = 0; i < linkRows.length; i += 1) {
      const row = linkRows[i];
      try {
        const customer = byId.get(String(row.matchCustomerId || ''));
        if (!customer?.id) throw new Error('العميل غير موجود');
        await repairJobService.update(row.jobId, {
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address || '',
        });
        await customerActivityService.record({
          customerId: String(customer.id),
          module: 'customers',
          action: 'repair.job_linked',
          title: 'ربط طلب صيانة (ترحيل)',
          summary: `#${row.receiptNo}`,
          referenceType: 'repair_job',
          referenceId: row.jobId,
          referenceLabel: row.receiptNo,
          actorUid: actor.userId,
          actorName: actor.userName,
        });
        linked += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: i + 1, total: linkRows.length });
    }

    setResult({ linked, failed });
    setStep('done');
    toast.success(`الربط اكتمل: ${linked} نجاح، ${failed} فشل.`);
  };

  return (
    <ModuleOpsPageShell
      eyebrow="العملاء"
      rangeLabel="مطابقة طلبات الصيانة بلا customerId مع ماستر العملاء عبر رقم الهاتف"
      actions={(
        <Button asChild variant="outline" size="sm">
          <Link to={withTenantPath(tenantSlug, '/customers')}>العودة للعملاء</Link>
        </Button>
      )}
    >
      <OpsDashPanel title="ربط طلبات الصيانة بالعملاء" accent="repair">
      {step === 'idle' && (
        <div className="rounded-xl border p-6 space-y-3 text-sm">
          <p>
            الأداة تقرأ طلبات الصيانة وعملاء الماستر، ثم تقترح الربط عند تطابق هاتف فريد (≥7 أرقام).
            لا تُنشئ عملاء جدد ولا تربط عند التعارض.
          </p>
          <Button type="button" onClick={() => void scan()}>
            بدء المسح
          </Button>
        </div>
      )}

      {step === 'scanning' && (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">جاري مسح الطلبات والعملاء…</div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          <div className="rounded-xl border p-4 text-sm grid gap-1 sm:grid-cols-3">
            <div>الإجمالي: <strong>{summary.total}</strong></div>
            <div>جاهز للربط: <strong>{summary.link}</strong></div>
            <div>مربوط مسبقًا: <strong>{summary.alreadyLinked}</strong></div>
            <div>بدون مطابقة: <strong>{summary.noMatch}</strong></div>
            <div>هاتف ناقص: <strong>{summary.noPhone}</strong></div>
            <div>تعارض: <strong>{summary.ambiguous}</strong></div>
          </div>
          <div className="overflow-x-auto rounded-xl border max-h-[420px]">
            <table className="erp-table w-full text-sm">
              <thead className="erp-thead sticky top-0 bg-[var(--color-card)]">
                <tr>
                  <th className="erp-th">الإيصال</th>
                  <th className="erp-th">العميل على الطلب</th>
                  <th className="erp-th">الهاتف</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">المطابقة</th>
                </tr>
              </thead>
              <tbody>
                {plans.slice(0, 300).map((row) => (
                  <tr key={row.jobId || `${row.receiptNo}-${row.customerPhone}`} className="border-t">
                    <td className="p-2 tabular-nums">{row.receiptNo || '—'}</td>
                    <td className="p-2">{row.customerName || '—'}</td>
                    <td className="p-2 tabular-nums">{row.customerPhone || '—'}</td>
                    <td className="p-2">{STATUS_LABEL[row.status]}</td>
                    <td className="p-2 text-xs">
                      {row.matchCode ? `${row.matchCode}` : row.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plans.length > 300 ? (
            <p className="text-xs text-muted-foreground">عرض أول 300 صف للمعاينة — التنفيذ يشمل كل الصفوف الجاهزة.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep('idle')}>
              إلغاء
            </Button>
            <Button type="button" disabled={linkRows.length === 0} onClick={() => void apply()}>
              تنفيذ الربط ({linkRows.length})
            </Button>
          </div>
        </div>
      )}

      {step === 'applying' && (
        <div className="rounded-xl border p-6 text-sm">
          جاري الربط… {progress.done} / {progress.total}
        </div>
      )}

      {step === 'done' && (
        <div className="rounded-xl border p-6 space-y-3 text-sm">
          <p>
            تم ربط <strong>{result.linked}</strong> طلب، وفشل <strong>{result.failed}</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void scan()}>
              إعادة المسح
            </Button>
            <Button asChild>
              <Link to={withTenantPath(tenantSlug, '/customers')}>سجل العملاء</Link>
            </Button>
          </div>
        </div>
      )}
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
