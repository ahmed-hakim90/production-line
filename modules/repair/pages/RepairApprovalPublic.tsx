import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ToneActionButton } from '@/src/components/erp/TableIconAction';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PublicCustomerSurfaceShell } from '../components/PublicCustomerSurfaceShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import {
  getRepairApprovalPublicCallable,
  isConfigured,
  submitRepairApprovalPublicCallable,
  type PublicRepairApprovalEstimate,
} from '../../../services/firebase';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

const fmtMoney = (value: number) =>
  `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;

const approvalStatusLabel = (status: string): string => {
  if (status === 'pending') return 'بانتظار موافقتكم';
  if (status === 'approved') return 'تمت الموافقة';
  if (status === 'rejected') return 'تم الرفض';
  return status || '—';
};

export const RepairApprovalPublic: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug = '' } = useParams<{ tenantSlug: string }>();
  const [searchParams] = useSearchParams();
  const jobId = useMemo(() => String(searchParams.get('job') || '').trim(), [searchParams]);
  const token = useMemo(() => String(searchParams.get('token') || '').trim(), [searchParams]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimate, setEstimate] = useState<PublicRepairApprovalEstimate | null>(null);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!jobId || !token) {
      setError('الرابط غير مكتمل. تأكد من نسخ الرابط كاملًا من رسالة الواتساب.');
      return;
    }
    if (!isConfigured || !tenantSlug.trim()) {
      setError('تعذر تحميل التقدير.');
      return;
    }

    let cancelled = false;
    setLoadingEstimate(true);
    setError('');
    void getRepairApprovalPublicCallable({
      tenantSlug: tenantSlug.trim(),
      jobId,
      token,
    })
      .then((res) => {
        if (cancelled) return;
        setEstimate(res.estimate);
        if (res.estimate.approvalStatus === 'approved' || res.estimate.approvalStatus === 'rejected') {
          setDone(res.estimate.approvalStatus);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : 'تعذر تحميل تفاصيل التقدير.';
        setError(message || 'تعذر تحميل تفاصيل التقدير.');
      })
      .finally(() => {
        if (!cancelled) setLoadingEstimate(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, token, tenantSlug]);

  const submit = async (decision: 'approved' | 'rejected') => {
    if (!isConfigured) return;
    if (!tenantSlug.trim() || !jobId || !token) {
      setError('بيانات الرابط غير كافية.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await submitRepairApprovalPublicCallable({
        tenantSlug: tenantSlug.trim(),
        jobId,
        token,
        decision,
        note: decision === 'rejected' ? note : undefined,
      });
      setDone(decision);
      setEstimate((prev) => (prev ? { ...prev, approvalStatus: decision } : prev));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'تعذر تنفيذ الطلب.';
      setError(message || 'تعذر تنفيذ الطلب.');
    } finally {
      setLoading(false);
    }
  };

  const canDecide = Boolean(estimate && estimate.approvalStatus === 'pending' && !done);

  return (
    <PublicCustomerSurfaceShell
      title="موافقة على التقدير"
      subtitle="لا يُطلب تسجيل دخول — استخدم الرابط المرسل إليك"
      dir={dir}
      contentClassName="max-w-lg"
    >
        <OpsDashPanel title="موافقة العميل على التقدير" accent="repair">
          {loadingEstimate ? (
            <p className="text-sm text-muted-foreground">جاري تحميل تفاصيل التقدير…</p>
          ) : null}

          {estimate ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-[var(--color-card)] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">بيانات العميل</span>
                  <Badge variant="outline">{approvalStatusLabel(estimate.approvalStatus)}</Badge>
                </div>
                <div className="grid gap-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">الاسم</span>
                    <span className="font-medium text-end">{estimate.customerName || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">الهاتف</span>
                    <span className="font-medium tabular-nums text-end" dir="ltr">{estimate.customerPhone || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">رقم الإيصال</span>
                    <span className="font-medium tabular-nums">{estimate.receiptNo || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">الجهاز</span>
                    <span className="font-medium text-end">
                      {[estimate.deviceBrand, estimate.deviceModel].filter(Boolean).join(' ') || '—'}
                      {estimate.deviceType ? ` (${estimate.deviceType})` : ''}
                    </span>
                  </div>
                  {estimate.problemDescription ? (
                    <div className="pt-1 border-t">
                      <div className="text-muted-foreground mb-1">وصف العطل</div>
                      <p className="leading-relaxed">{estimate.problemDescription}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              {estimate.products.length > 0 ? (
                <div className="rounded-lg border bg-[var(--color-card)] p-3 space-y-2">
                  <div className="font-medium">تفصيل المنتجات</div>
                  <div className="space-y-2">
                    {estimate.products.map((row, idx) => (
                      <div key={`${row.name}-${idx}`} className="rounded-md border px-3 py-2 space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div>
                              {row.name}
                              <span className="text-muted-foreground text-xs ms-1">×{row.quantity}</span>
                            </div>
                            <div className={`text-xs font-medium ${row.inWarranty ? 'text-[rgb(var(--color-primary))]' : 'text-muted-foreground'}`}>
                              {row.warrantyLabel || (row.inWarranty ? 'داخل الضمان' : 'بدون ضمان')}
                            </div>
                          </div>
                          <span className="shrink-0 tabular-nums font-medium">
                            {row.inWarranty ? 'مجاني' : fmtMoney(row.lineCost)}
                          </span>
                        </div>
                        {(row.works || []).length > 0 ? (
                          <div className="space-y-1 border-t pt-1.5">
                            {row.works!.map((work, workIdx) => (
                              <div key={`${work.kind}-${work.name}-${workIdx}`} className="flex justify-between gap-2 text-xs">
                                <span className="min-w-0 text-muted-foreground">
                                  {work.kind === 'part' ? 'قطعة' : 'خدمة'} · {work.name}
                                  {work.quantity > 1 ? ` ×${work.quantity}` : ''}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {work.inWarranty ? 'مجاني' : fmtMoney(work.lineCost)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(estimate.unassignedWorks || []).length > 0 ? (
                <div className="rounded-lg border bg-[var(--color-card)] p-3 space-y-2">
                  <div className="font-medium">بنود غير مربوطة بمنتج</div>
                  {estimate.unassignedWorks!.map((work, idx) => (
                    <div key={`unassigned-${idx}`} className="flex justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        {work.kind === 'part' ? 'قطعة' : 'خدمة'} · {work.name}
                      </span>
                      <span className="tabular-nums">{work.inWarranty ? 'مجاني' : fmtMoney(work.lineCost)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {estimate.parts.length > 0
                && !estimate.products.some((row) => (row.works || []).some((work) => work.kind === 'part'))
                && !(estimate.unassignedWorks || []).some((work) => work.kind === 'part') ? (
                <div className="rounded-lg border bg-[var(--color-card)] p-3 space-y-2">
                  <div className="font-medium">قطع الغيار المقترحة</div>
                  <div className="divide-y rounded-md border">
                    {estimate.parts.map((part, idx) => (
                      <div key={`${part.partName}-${idx}`} className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-medium">{part.partName}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            ×{part.quantity.toLocaleString('ar-EG')}
                            {part.unitPrice > 0 ? ` · ${fmtMoney(part.unitPrice)} للوحدة` : ''}
                          </div>
                          {part.inWarranty ? (
                            <div className="text-xs font-medium text-[rgb(var(--color-primary))]">
                              {part.warrantyLabel || 'داخل الضمان'}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 font-medium tabular-nums">
                          {part.inWarranty ? 'مجاني' : fmtMoney(part.lineTotal)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border bg-[var(--color-bg)] p-3 space-y-2">
                <div className="font-medium">تفصيل الحساب</div>
                <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                  <span>إذن الدفع</span>
                  <span className="tabular-nums">{estimate.authorizationNo} · إصدار {estimate.revision}</span>
                </div>
                {estimate.partsCost > 0 ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">قطع الغيار</span>
                    <span className="tabular-nums">{fmtMoney(estimate.partsCost)}</span>
                  </div>
                ) : null}
                {estimate.laborCost > 0 ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">أجور الصيانة</span>
                    <span className="tabular-nums">{fmtMoney(estimate.laborCost)}</span>
                  </div>
                ) : null}
                {estimate.serviceOnlyCost > 0 ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">خدمة</span>
                    <span className="tabular-nums">{fmtMoney(estimate.serviceOnlyCost)}</span>
                  </div>
                ) : null}
                {(estimate.billableProductsCost ?? estimate.productsCost) > 0 ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">منتجات بدون ضمان</span>
                    <span className="tabular-nums">{fmtMoney(estimate.billableProductsCost ?? estimate.productsCost)}</span>
                  </div>
                ) : null}
                {Number(estimate.warrantyProductsCost || 0) > 0 ? (
                  <div className="flex justify-between gap-2 text-[rgb(var(--color-primary))]">
                    <span>منتجات داخل الضمان</span>
                    <span className="tabular-nums">مجاني</span>
                  </div>
                ) : null}
                {estimate.discountAmount > 0 ? (
                  <div className="flex justify-between gap-2 text-[rgb(var(--color-danger))]">
                    <span>الخصم المعتمد</span>
                    <span className="tabular-nums">- {fmtMoney(estimate.discountAmount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2 border-t pt-2 text-base">
                  <span className="font-bold">صافي المطلوب</span>
                  <span className="font-bold tabular-nums text-primary">{fmtMoney(estimate.estimatedTotal)}</span>
                </div>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-[rgb(var(--color-danger))]">{error}</p> : null}

          {done ? (
            <p className="text-[rgb(var(--color-success))] font-medium">
              {done === 'approved' ? 'تم تسجيل موافقتكم. شكراً لكم.' : 'تم تسجيل الرفض. يمكنكم التواصل مع الفرع.'}
            </p>
          ) : canDecide ? (
            <>
              <p className="text-sm text-muted-foreground">
                راجعوا التفاصيل أعلاه ثم أكّدوا أو ارفضوا التقدير. لا يُطلب تسجيل دخول.
              </p>
              <div className="space-y-2">
                <Label htmlFor="rej-note">ملاحظة عند الرفض (اختياري)</Label>
                <Input
                  id="rej-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="سبب الرفض أو استفسار"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <ToneActionButton
                  action="approve"
                  className="flex-1 min-h-12"
                  disabled={loading || !jobId || !token}
                  loading={loading}
                  onClick={() => void submit('approved')}
                >
                  موافقة على التقدير
                </ToneActionButton>
                <ToneActionButton
                  action="reject"
                  className="flex-1 min-h-12"
                  disabled={loading || !jobId || !token}
                  loading={loading}
                  onClick={() => void submit('rejected')}
                >
                  رفض
                </ToneActionButton>
              </div>
            </>
          ) : null}
        </OpsDashPanel>
    </PublicCustomerSurfaceShell>
  );
};

export default RepairApprovalPublic;
