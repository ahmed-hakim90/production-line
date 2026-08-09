import React, { useCallback, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { LoadingSkeleton, SearchableSelect } from '@/modules/production/components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/Toast';
import { activityLogService } from '@/modules/system/services/activityLogService';
import { useActiveRoutingPlansQuery, useSoftDeleteRoutingPlanMutation } from '../hooks/routingQueries';
import { formatDurationSeconds } from '../domain/calculations';
import { formatRoutingFirestoreInstant } from '../domain/formatFirestore';
import type { ProductionRoutingPlan } from '../types';
import { cn } from '@/lib/utils';
import { filterProductionProducts } from '@/modules/production/utils/isProductionProduct';

export const RoutingPlansPage: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const userEmail = useAppStore((s) => s.userEmail);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const { data: plans = [], isLoading, isError, refetch } = useActiveRoutingPlansQuery();
  const deletePlanMut = useSoftDeleteRoutingPlanMutation();
  const [pickProductId, setPickProductId] = useState('');

  const productName = useCallback(
    (id: string) => {
      const fromTable = products.find((p) => p.id === id)?.name?.trim();
      if (fromTable) return fromTable;
      const fromRaw = _rawProducts.find((p) => p.id === id)?.name?.trim();
      if (fromRaw) return fromRaw;
      return id;
    },
    [products, _rawProducts],
  );

  const resolveCreatorLabel = useCallback(
    (createdByUid: string) => {
      const u = String(createdByUid || '').trim();
      if (!u) return '—';
      const emp = _rawEmployees.find((e) => e.userId === u);
      if (emp?.name?.trim()) return emp.name.trim();
      if (uid === u && userDisplayName?.trim()) return userDisplayName.trim();
      return `مستخدم …${u.slice(-6)}`;
    },
    [_rawEmployees, uid, userDisplayName],
  );

  const handleSoftDelete = useCallback(
    async (plan: ProductionRoutingPlan) => {
      const label = productName(plan.productId);
      if (
        !window.confirm(
          `حذف مسار المنتج «${label}» (إصدار ${plan.version})؟\nسيتم إخفاء الخطة من القائمة النشطة ويمكن إنشاء مسار جديد لاحقاً.`,
        )
      ) {
        return;
      }
      try {
        await deletePlanMut.mutateAsync(plan.id);
        if (uid && userEmail) {
          void activityLogService.log(uid, userEmail, 'ROUTING_SOFT_DELETE_PLAN', `حذف مسار إنتاج: ${label} (إصدار ${plan.version})`, {
            planId: plan.id,
            productId: plan.productId,
            version: plan.version,
          });
        }
        toast.success('تم حذف المسار');
      } catch (e) {
        console.error(e);
        toast.error('تعذر حذف المسار', { description: 'تحقق من الصلاحيات أو الاتصال.' });
      }
    },
    [deletePlanMut, productName, uid, userEmail],
  );

  const sorted = useMemo(
    () => [...plans].sort((a, b) => productName(a.productId).localeCompare(productName(b.productId), 'ar')),
    [plans, productName],
  );

  const productOptions = useMemo(
    () => filterProductionProducts(_rawProducts)
      .filter((p) => Boolean(p.id))
      .map((p) => ({ value: p.id!, label: p.name })),
    [_rawProducts],
  );

  const planActions = (plan: ProductionRoutingPlan, layout: 'mobile' | 'table') => (
    <div
      className={cn(
        'flex gap-2',
        layout === 'mobile' ? 'flex-col' : 'flex-row flex-wrap justify-end',
      )}
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={layout === 'mobile' ? 'w-full' : ''}
        disabled={!can('routing.view')}
        onClick={() => navigate(`/production/routing/${plan.productId}?planId=${plan.id}`)}
      >
        عرض الخطة
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={layout === 'mobile' ? 'w-full' : ''}
        disabled={!can('routing.manage')}
        onClick={() => navigate(`/production/routing/${plan.productId}?fromPlanId=${plan.id}`)}
      >
        تعديل (إصدار جديد)
      </Button>
      <Button
        type="button"
        size="sm"
        className={layout === 'mobile' ? 'w-full' : ''}
        disabled={!can('routing.execute')}
        onClick={() => navigate(`/production/routing/execution/new?productId=${plan.productId}`)}
      >
        بدء تنفيذ
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className={layout === 'mobile' ? 'w-full' : ''}
        disabled={!can('routing.manage') || deletePlanMut.isPending}
        onClick={() => void handleSoftDelete(plan)}
      >
        حذف
      </Button>
    </div>
  );

  return (
    <ModuleOpsPageShell
      className="w-full min-w-0"
      eyebrow="مسارات الإنتاج"
      rangeLabel="الخطط النشطة لكل منتج — التخطيط والتنفيذ والتحليل"
      actions={(
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/production/routing/analytics')}>
            تحليلات المسارات
          </Button>
          {can('routing.manage') ? (
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/products')}>
              فتح كتالوج المنتجات
            </Button>
          ) : null}
        </div>
      )}
    >
      {isError && (
        <OpsDashPanel accent="production">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">تعذر تحميل البيانات.</p>
            <Button type="button" variant="outline" className="w-full shrink-0 sm:w-auto" onClick={() => void refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        </OpsDashPanel>
      )}
      <OpsDashPanel title="الخطط النشطة" accent="production" bodyClassName="p-0">
        {isLoading ? (
          <div className="p-4 sm:p-6">
            <LoadingSkeleton rows={8} type="card" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-10 px-4">
            <p className="text-center text-sm text-muted-foreground">
              لا توجد خطط مسار نشطة. استخدم «بناء مسار لمنتج» بالأسفل لإنشاء أول مسار.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-4 sm:p-6 md:hidden">
              {sorted.map((plan) => (
                <div key={plan.id} className="rounded-xl border border-[var(--color-border)] bg-card shadow-sm">
                  <div className="space-y-1 p-4 pb-2">
                    <h4 className="text-base font-semibold leading-tight">{productName(plan.productId)}</h4>
                    <p className="text-sm text-muted-foreground tabular-nums">الإصدار {plan.version}</p>
                  </div>
                  <div className="space-y-3 p-4 pt-0">
                    <div className="space-y-1 text-sm tabular-nums">
                      <div className="font-medium">{formatDurationSeconds(plan.totalTimeSeconds)}</div>
                      <div className="text-muted-foreground text-[11px]">
                        تارجت التقارير:{' '}
                        {plan.routingTargetUnitSeconds != null && plan.routingTargetUnitSeconds > 0
                          ? `${Math.round(plan.routingTargetUnitSeconds)} ث/وحدة`
                          : '—'}
                      </div>
                      {plan.totalManTimeSeconds > plan.totalTimeSeconds + 0.5 && (
                        <div className="text-muted-foreground text-[11px]">
                          (إصدار قديم: زمن-عمالة مسجّل {formatDurationSeconds(plan.totalManTimeSeconds)})
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">أنشئ بواسطة:</span> {resolveCreatorLabel(plan.createdBy)}
                    </div>
                    <div className="text-sm tabular-nums text-muted-foreground">
                      {formatRoutingFirestoreInstant(plan.createdAt)}
                    </div>
                    {planActions(plan, 'mobile')}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden min-w-0 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">المنتج</TableHead>
                    <TableHead className="text-center">الإصدار</TableHead>
                    <TableHead className="text-start">إجمالي زمن المسار</TableHead>
                    <TableHead className="text-center">تارجت التقارير</TableHead>
                    <TableHead className="text-start">أنشئ بواسطة</TableHead>
                    <TableHead className="text-start">تاريخ الإنشاء</TableHead>
                    <TableHead className="text-end">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{productName(plan.productId)}</TableCell>
                      <TableCell className="text-center tabular-nums">{plan.version}</TableCell>
                      <TableCell>
                        <div className="text-sm tabular-nums">
                          <div>{formatDurationSeconds(plan.totalTimeSeconds)}</div>
                          {plan.totalManTimeSeconds > plan.totalTimeSeconds + 0.5 && (
                            <div className="text-muted-foreground text-[11px]">
                              إصدار قديم: زمن-عمالة {formatDurationSeconds(plan.totalManTimeSeconds)}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {plan.routingTargetUnitSeconds != null && plan.routingTargetUnitSeconds > 0
                          ? `${Math.round(plan.routingTargetUnitSeconds)} ث`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{resolveCreatorLabel(plan.createdBy)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                        {formatRoutingFirestoreInstant(plan.createdAt)}
                      </TableCell>
                      <TableCell className="text-end">{planActions(plan, 'table')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </OpsDashPanel>
      {can('routing.manage') && (
        <OpsDashPanel title="بناء مسار لمنتج" accent="production">
          <p className="text-sm text-muted-foreground mb-4">
            اختر المنتج من القائمة ثم اضغط «فتح بناء المسار». صفحة المنتجات تفتح تفاصيل المنتج في لوحة جانبية عند الضغط على الصف وليست مخصصة لاختيار مسار الإنتاج.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">المنتج</Label>
              <SearchableSelect
                options={productOptions}
                value={pickProductId}
                onChange={setPickProductId}
                placeholder="ابحث واختر منتجاً"
              />
            </div>
            <Button
              type="button"
              className="w-full shrink-0 sm:w-auto"
              disabled={!pickProductId}
              onClick={() => navigate(`/production/routing/${pickProductId}`)}
            >
              فتح بناء المسار
            </Button>
          </div>
        </OpsDashPanel>
      )}
    </ModuleOpsPageShell>
  );
};

export default RoutingPlansPage;
