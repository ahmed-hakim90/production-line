import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { GripVertical, Info, Package, Zap } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { tenantHomePath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { LoadingSkeleton } from '@/modules/production/components/UI';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/Toast';
import {
  usePublishRoutingPlanMutation,
  useRoutingPlanQuery,
  useRoutingStepsQuery,
} from '../hooks/routingQueries';
import { formatDurationSeconds, totalTimeSecondsFromSteps } from '../domain/calculations';
import type { RoutingStepDraft } from '../types';
import { routingPlanService } from '../services/routingPlanService';
import { newRoutingDraft, routingStepLgGridClass, SortableRoutingStepRow } from './planBuilderSortableRow';
import { cn } from '@/lib/utils';

function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-muted-foreground',
            iconClassName,
          )}
        >
          <Icon className="size-[18px]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-medium leading-none text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold tabular-nums leading-tight tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export const PlanBuilderPage: React.FC = () => {
  const { productId: routeProductId = '', tenantSlug } = useParams<{ productId: string; tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('planId') ?? '';
  const fromPlanId = searchParams.get('fromPlanId') ?? '';
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const products = useAppStore((s) => s.products);

  const readonly = Boolean(planId) && !fromPlanId;
  const effectiveReadonly = readonly || !can('routing.manage');
  const sourcePlanId = planId || fromPlanId;

  const { data: sourcePlan, isLoading: planLoading } = useRoutingPlanQuery(sourcePlanId || undefined);
  const { data: sourceSteps = [], isLoading: stepsLoading } = useRoutingStepsQuery(sourcePlanId || undefined);

  const [steps, setSteps] = useState<RoutingStepDraft[]>([newRoutingDraft()]);
  const publish = usePublishRoutingPlanMutation();

  useEffect(() => {
    if (!sourcePlanId || sourceSteps.length === 0) return;
    setSteps(
      sourceSteps.map((s) => ({
        clientKey: s.id,
        name: s.name,
        durationSeconds: s.durationSeconds,
        workersCount: s.workersCount,
      })),
    );
  }, [sourcePlanId, sourceSteps]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const totalRouteSeconds = useMemo(() => totalTimeSecondsFromSteps(steps), [steps]);

  const productName = products.find((p) => p.id === routeProductId)?.name ?? routeProductId;

  const onDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((r) => r.clientKey === active.id);
      const newIndex = prev.findIndex((r) => r.clientKey === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const updateRow = useCallback((key: string, patch: Partial<RoutingStepDraft>) => {
    setSteps((prev) => prev.map((r) => (r.clientKey === key ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((key: string) => {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.clientKey !== key)));
  }, []);

  const addRow = useCallback(() => {
    setSteps((prev) => [...prev, newRoutingDraft()]);
  }, []);

  const handleSave = async () => {
    if (!uid || !routeProductId || readonly || !can('routing.manage')) return;
    const unnamed = steps.filter((s) => !s.name.trim()).length;
    if (unnamed > 0) {
      toast.warning('عُد تسمية الخطوات', {
        description: `يوجد ${unnamed} خطوة بلا اسم واضح. أضف اسماً لكل خطوة لتسهيل التنفيذ والتقارير.`,
      });
      return;
    }
    const rows = steps.map((s) => ({
      name: s.name.trim() || 'خطوة',
      durationSeconds: s.durationSeconds,
      workersCount: s.workersCount,
    }));
    if (rows.length === 0) return;
    let deactivate: string | undefined;
    try {
      if (fromPlanId) {
        deactivate = fromPlanId;
      } else {
        const active = await routingPlanService.getActivePlanForProduct(routeProductId);
        if (active) deactivate = active.id;
      }
      await publish.mutateAsync({
        productId: routeProductId,
        createdBy: uid,
        deactivatePlanId: deactivate,
        stepRows: rows,
      });
      void useAppStore.getState().fetchRoutingPlanTotals();
      toast.success('تم حفظ مسار الإنتاج');
      navigate('/production/routing');
    } catch (e) {
      console.error(e);
      toast.error('تعذر حفظ الخطة', {
        description: 'تحقق من الاتصال أو الصلاحيات ثم أعد المحاولة.',
      });
    }
  };

  const loading = Boolean(sourcePlanId) && (planLoading || stepsLoading);

  const pageSubtitle = useMemo(() => {
    if (!routeProductId) return 'اختر منتجاً من صفحة مسارات الإنتاج';
    if (readonly) return productName;
    if (fromPlanId && sourcePlan) return `${productName} — إصدار جديد مبني على v${sourcePlan.version}`;
    if (sourcePlan) return `${productName} — تعديل مسار (أساس v${sourcePlan.version})`;
    return `${productName} — مسار جديد لهذا المنتج`;
  }, [routeProductId, readonly, fromPlanId, sourcePlan, productName]);

  const versionSummary = sourcePlan ? `v${sourcePlan.version}` : 'جديد';

  if (can('routing.execute') && !can('routing.view') && !planId && !fromPlanId) {
    return <Navigate to={tenantHomePath(tenantSlug)} replace />;
  }

  return (
    <div className="erp-ds-clean w-full min-w-0 space-y-5 pb-24 md:space-y-6 md:pb-8">
      <PageHeader
        title="بناء مسار الإنتاج"
        subtitle={pageSubtitle}
        icon="factory"
        iconBg="bg-emerald-500/15"
        iconColor="text-emerald-600 dark:text-emerald-400"
        backAction={{ onClick: () => navigate('/production/routing'), label: 'مسارات الإنتاج' }}
      />
      {!routeProductId && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          معرّف المنتج غير صالح. ارجع إلى{' '}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => navigate('/production/routing')}>
            مسارات الإنتاج
          </button>{' '}
          واختر منتجاً.
        </div>
      )}
      {loading && <LoadingSkeleton rows={10} type="card" />}
      {!loading && routeProductId && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {readonly ? (
              <Badge variant="secondary" className="font-medium">
                عرض فقط
              </Badge>
            ) : effectiveReadonly ? (
              <Badge variant="outline" className="border-amber-500/50 font-medium text-amber-950 dark:text-amber-100">
                مراجعة فقط
              </Badge>
            ) : (
              <Badge className="bg-primary font-medium text-primary-foreground hover:bg-primary/90">وضع التحرير</Badge>
            )}
            {fromPlanId && !effectiveReadonly && (
              <span className="text-xs text-muted-foreground">سيتم استبدال النسخة النشطة عند الحفظ حسب إعدادات النظام.</span>
            )}
          </div>

          {!readonly && effectiveReadonly && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              ليس لديك صلاحية تعديل المسارات. يمكنك مراجعة الخطوات فقط.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard label="مرجع الإصدار" value={versionSummary} icon={Package} />
            <StatCard
              label="إجمالي زمن المسار"
              value={formatDurationSeconds(totalRouteSeconds)}
              icon={Zap}
              iconClassName="text-amber-600 dark:text-amber-400"
            />
          </div>

          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
              <CardTitle className="text-base font-semibold">خطوات المسار</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              {readonly && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  هذه القراءة فقط. لإنشاء إصدار جديد استخدم «تعديل (إصدار جديد)» من قائمة مسارات الإنتاج.
                </p>
              )}
              {!effectiveReadonly && (
                <div className="flex gap-3 rounded-lg border border-border/80 bg-muted/40 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
                  <GripVertical className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden />
                  <p>
                    <span className="font-medium text-foreground">ترتيب الخطوات:</span> اسحب من عمود المقبض. أدخل{' '}
                    <span className="font-medium text-foreground">الوقت</span> بالثواني أو استخدم أزرار التايمر بجانب الحقل ثم اضغط{' '}
                    <span className="font-medium text-foreground">أيقونة اعتماد الوقت الخضراء</span>.{' '}
                    <span className="font-medium text-foreground">زمن الخطوة</span> هو زمن تنفيذ المرحلة على الخط (عمل متوازٍ): ثلاثة عمال على مرحلة 10 ثوانٍ يظل الزمن 10 ثوانٍ، وعدد العمال يُسجَّل للمتابعة والتكلفة وليس لضرب الزمن.
                  </p>
                </div>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <div className="rounded-lg border bg-muted/30 p-2 sm:p-3">
                  <div
                    className={cn(
                      'mb-2 hidden gap-x-2 px-1 text-xs font-semibold text-muted-foreground lg:grid',
                      routingStepLgGridClass,
                    )}
                  >
                    {/* In-flow spacer: sr-only alone is position:absolute and can break grid column alignment vs data rows */}
                    <span className="flex items-center justify-center" aria-hidden>
                      <span className="inline-flex size-9 shrink-0" />
                      <span className="sr-only">سحب لإعادة الترتيب</span>
                    </span>
                    <span className="text-center tabular-nums">#</span>
                    <span className="text-start">الاسم</span>
                    <span className="text-start whitespace-nowrap">عدد العمال</span>
                    <span className="text-start">
                      <span className="block leading-tight">زمن الخطوة</span>
                      <span className="mt-0.5 block text-[11px] font-normal opacity-90">بالثواني (زمن على الخط)</span>
                    </span>
                    <span className="flex items-center justify-center" aria-hidden>
                      <span className="inline-flex size-9 shrink-0" />
                      <span className="sr-only">حذف</span>
                    </span>
                  </div>
                  <SortableContext items={steps.map((s) => s.clientKey)} strategy={verticalListSortingStrategy}>
                    <div className="flex min-w-0 flex-col gap-3">
                      {steps.map((row, i) => (
                        <SortableRoutingStepRow
                          key={row.clientKey}
                          row={row}
                          stepIndex={i + 1}
                          readonly={effectiveReadonly}
                          onChange={updateRow}
                          onRemove={removeRow}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              </DndContext>
            </CardContent>
            <CardFooter className="flex flex-col-reverse gap-3 border-t bg-muted/20 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/production/routing')}>
                رجوع لمسارات الإنتاج
              </Button>
              {!effectiveReadonly && (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-2">
                  <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={addRow}>
                    إضافة خطوة
                  </Button>
                  <Button type="button" className="w-full sm:w-auto" onClick={() => void handleSave()} disabled={publish.isPending}>
                    {publish.isPending ? 'جاري الحفظ…' : 'حفظ كإصدار جديد'}
                  </Button>
                </div>
              )}
            </CardFooter>
          </Card>

          {!effectiveReadonly && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 opacity-80" aria-hidden />
              <span>عند الحفظ يُنشأ إصدار جديد من المسار. إن وُجدت خطة نشطة لنفس المنتج قد تُستبدل تلقائياً وفق سياسة الإصدار لديك.</span>
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default PlanBuilderPage;
