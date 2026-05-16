import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { KPIBox, LoadingSkeleton, SearchableSelect } from '@/modules/production/components/UI';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from '@/components/Toast';
import {
  routingQueryKeys,
  useCompletedRoutingExecutionsQuery,
  useDeleteCompletedRoutingExecutionMutation,
} from '../hooks/routingQueries';
import { routingExecutionService } from '../services/routingExecutionService';
import type { ProductionRoutingExecution } from '../types';
import {
  computeRoutingCalculation,
  formatDurationSeconds,
} from '../domain/calculations';
import { formatRoutingFirestoreInstant } from '../domain/formatFirestore';

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">{children}</CardContent>
    </Card>
  );
}

function routingInstantDateKey(value: unknown): string {
  let date: Date | null = null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    date = (value as { toDate: () => Date }).toDate();
  } else if (value && typeof value === 'object' && 'seconds' in value) {
    const seconds = Number((value as { seconds: number }).seconds);
    if (Number.isFinite(seconds)) date = new Date(seconds * 1000);
  } else if (value != null && value !== '') {
    date = new Date(value as string | number);
  }
  if (!date || !Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export const RoutingAnalyticsPage: React.FC = () => {
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const navigate = useTenantNavigate();
  const products = useAppStore((s) => s.products);
  const routingTotalTimeSecondsByProduct = useAppStore((s) => s.routingTotalTimeSecondsByProduct);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const completedLimit = 100;
  const { data: completed = [], isLoading } = useCompletedRoutingExecutionsQuery(completedLimit);
  const deleteExecutionMut = useDeleteCompletedRoutingExecutionMutation(completedLimit);
  const [filterProductId, setFilterProductId] = useState('');
  const [filterSupervisorId, setFilterSupervisorId] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');

  const resolveSupervisorLabel = useCallback(
    (supervisorUid: string) => {
      const u = String(supervisorUid || '').trim();
      if (!u) return '—';
      const emp = _rawEmployees.find((e) => e.userId === u);
      if (emp?.name?.trim()) return emp.name.trim();
      if (uid === u && userDisplayName?.trim()) return userDisplayName.trim();
      return `مستخدم …${u.slice(-6)}`;
    },
    [_rawEmployees, uid, userDisplayName],
  );

  const filteredExecutions = useMemo(() => {
    return completed.filter((e) => {
      if (filterProductId && e.productId !== filterProductId) return false;
      if (filterSupervisorId && e.supervisorId !== filterSupervisorId) return false;
      const isoDate = routingInstantDateKey(e.finishedAt);
      if (filterFromDate && isoDate && isoDate < filterFromDate) return false;
      if (filterToDate && isoDate && isoDate > filterToDate) return false;
      return true;
    });
  }, [completed, filterFromDate, filterProductId, filterSupervisorId, filterToDate]);

  const productsWithRouting = useMemo(
    () => products.filter((p) => (routingTotalTimeSecondsByProduct[p.id] ?? 0) > 0),
    [products, routingTotalTimeSecondsByProduct],
  );

  const productFilterOptions = useMemo(
    () => [
      { value: '', label: 'كل المنتجات' },
      ...productsWithRouting.map((p) => ({ value: p.id, label: p.name })),
    ],
    [productsWithRouting],
  );
  const supervisorFilterOptions = useMemo(() => {
    const ids = Array.from(new Set(completed.map((e) => e.supervisorId).filter(Boolean))).sort();
    return [
      { value: '', label: 'كل المشرفين' },
      ...ids.map((id) => ({ value: id, label: resolveSupervisorLabel(id) })),
    ];
  }, [completed, resolveSupervisorLabel]);

  useEffect(() => {
    if (!filterProductId) return;
    if ((routingTotalTimeSecondsByProduct[filterProductId] ?? 0) <= 0) {
      setFilterProductId('');
    }
  }, [filterProductId, routingTotalTimeSecondsByProduct]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  const handleDeleteExecution = useCallback(
    async (e: React.MouseEvent, row: ProductionRoutingExecution) => {
      e.stopPropagation();
      const name = products.find((p) => p.id === row.productId)?.name ?? row.productId;
      if (
        !window.confirm(
          `حذف سجل التنفيذ المكتمل للمنتج «${name}» (كمية ${row.quantity})؟\nلن يمكن استرجاع البيانات.`,
        )
      ) {
        return;
      }
      try {
        await deleteExecutionMut.mutateAsync(row.id);
        if (selectedId === row.id) {
          setSelectedId('');
        }
        toast.success('تم حذف سجل التنفيذ');
      } catch (err) {
        console.error(err);
        toast.error('تعذر الحذف', { description: 'تحقق من صلاحية إدارة المسارات أو القواعد.' });
      }
    },
    [deleteExecutionMut, products, selectedId],
  );

  const execQuery = useQuery({
    queryKey: routingQueryKeys.execution(selectedId),
    queryFn: () => routingExecutionService.getById(selectedId),
    enabled: Boolean(selectedId),
  });
  const stepsQuery = useQuery({
    queryKey: routingQueryKeys.executionSteps(selectedId),
    queryFn: () => routingExecutionService.getExecutionSteps(selectedId),
    enabled: Boolean(selectedId),
  });

  const execution = execQuery.data;
  const steps = stepsQuery.data ?? [];
  const selectedCalculation = useMemo(() => {
    if (!execution) return null;
    return computeRoutingCalculation({
      productId: execution.productId,
      quantity: execution.quantity,
      workerHourRate: Number(execution.workerHourRateUsed ?? 0),
      steps: steps.map((s) => ({
        name: s.name,
        durationSeconds: s.standardDurationSeconds,
        workersCount: s.standardWorkersCount,
        actualDurationSeconds: s.actualDurationSeconds ?? 0,
        actualWorkersCount: s.actualWorkersCount ?? 0,
      })),
    });
  }, [execution, steps]);
  const analyticsKpis = useMemo(() => {
    const count = filteredExecutions.length;
    const totalCost = filteredExecutions.reduce((sum, e) => sum + Number(e.totalCost || 0), 0);
    const avgTimeEfficiency = count > 0
      ? filteredExecutions.reduce((sum, e) => sum + Number(e.timeEfficiency || 0), 0) / count
      : 0;
    const totalQty = filteredExecutions.reduce((sum, e) => sum + Number(e.quantity || 0), 0);
    return { count, totalCost, avgTimeEfficiency, totalQty };
  }, [filteredExecutions]);

  useEffect(() => {
    setSelectedId((prev) => {
      if (filteredExecutions.length === 0) return '';
      if (!prev || !filteredExecutions.some((e) => e.id === prev)) return filteredExecutions[0].id;
      return prev;
    });
  }, [filteredExecutions]);

  const chartTime = useMemo(
    () =>
      steps.map((s) => ({
        name: s.name.slice(0, 14),
        standard: s.standardDurationSeconds,
        actual: s.actualDurationSeconds ?? 0,
      })),
    [steps],
  );

  const chartCost = useMemo(() => {
    return selectedCalculation?.stepVariances.map((s) => ({
      name: s.name.slice(0, 14),
      cost: s.laborCost,
    })) ?? [];
  }, [selectedCalculation]);

  const chartVar = useMemo(
    () =>
      selectedCalculation?.stepVariances.map((s) => ({
        name: s.name.slice(0, 12),
        timeVar: s.timeVarianceRatio * 100,
        workerVar: s.workerVarianceRatio * 100,
      })) ?? [],
    [selectedCalculation],
  );

  const bottleneck = useMemo(() => {
    const variances = selectedCalculation?.stepVariances ?? [];
    if (!variances.length) return null;
    let best = variances[0];
    let score = -1;
    for (const s of variances) {
      const sc = Math.abs(s.timeVarianceRatio) * 1000 + s.laborCost;
      if (sc > score) {
        score = sc;
        best = s;
      }
    }
    return best;
  }, [selectedCalculation]);

  const rowSelectClass = (id: string) =>
    cn(
      'cursor-pointer transition-colors',
      selectedId === id
        ? 'bg-primary/10 ring-2 ring-inset ring-primary/40 dark:bg-primary/15'
        : 'hover:bg-muted/50',
    );

  if (!can('routing.analytics')) {
    return (
      <div className="erp-ds-clean w-full min-w-0">
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              ليس لديك صلاحية عرض تحليلات المسارات.
            </div>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/production/routing')}>
              مسارات الإنتاج
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const detailPanel = (
    <div className="min-w-0 space-y-5 order-2 xl:order-1">
      <Card className="shadow-sm">
        <CardHeader className="px-4 py-3 sm:px-6">
          <CardTitle className="text-base">تفاصيل التنفيذ المختار</CardTitle>
          <CardDescription>تُحدَّث الكروت والرسوم تلقائياً عند اختيار تنفيذ من القائمة أو البطاقات.</CardDescription>
        </CardHeader>
      </Card>

      {selectedId && execQuery.isFetching && !execution && (
        <LoadingSkeleton rows={6} type="card" />
      )}

      {selectedId && !execQuery.isFetching && !execution && (
        <Card className="shadow-sm">
          <CardContent className="py-6">
            <p className="text-center text-sm text-muted-foreground">تعذر تحميل بيانات هذا التنفيذ.</p>
          </CardContent>
        </Card>
      )}

      {execution && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <KPIBox
            icon="bar_chart"
            label="كفاءة الزمن % (مجموع مراحل)"
            value={
              execution.timeEfficiency != null
                ? (execution.timeEfficiency * 100).toFixed(1)
                : '—'
            }
            colorClass="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          />
          {execution.timeEfficiency != null &&
            execution.laborEfficiency != null &&
            Math.abs(execution.timeEfficiency - execution.laborEfficiency) > 0.001 && (
              <KPIBox
                icon="groups"
                label="كفاءة العمالة % (إصدار قديم)"
                value={(execution.laborEfficiency * 100).toFixed(1)}
                colorClass="bg-sky-500/15 text-sky-700 dark:text-sky-400"
              />
            )}
          <KPIBox
            icon="payments"
            label="تكلفة الوحدة"
            value={execution.costPerUnit != null ? execution.costPerUnit.toFixed(2) : '—'}
            colorClass="bg-amber-500/15 text-amber-800 dark:text-amber-300"
          />
          <KPIBox
            icon="schedule"
            label="إجمالي الزمن الفعلي"
            value={formatDurationSeconds(execution.actualTotalTimeSeconds ?? 0)}
            colorClass="bg-violet-500/15 text-violet-700 dark:text-violet-300"
          />
        </div>
      )}

      {bottleneck && (
        <Card className="shadow-sm">
          <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
            <CardTitle className="text-base font-semibold">اختناق مُقترَح</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <p className="text-sm leading-relaxed">
              أعلى تأثير حسب الانحراف والتكلفة: <strong>{bottleneck.name}</strong> —{' '}
              {formatDurationSeconds(bottleneck.actualDurationSeconds ?? 0)} فعلي مقابل{' '}
              {formatDurationSeconds(bottleneck.standardDurationSeconds)} قياسي، تكلفة تقريبية {bottleneck.laborCost.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      )}

      {steps.length > 0 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5">
            <ChartCard title="زمن قياسي مقابل فعلي (ثانية)">
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartTime}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="standard" name="قياسي" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" name="فعلي" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <ChartCard title="تكلفة العمالة حسب الخطوة">
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartCost}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="cost" name="تكلفة" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
          <ChartCard title="انحراف % (زمن / عمالة)">
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartVar}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="timeVar" name="انحراف زمن %" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="workerVar" name="انحراف عمال %" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}

      {!selectedId && !isLoading && filteredExecutions.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">
              اختر تنفيذاً من القائمة (عريض) أو البطاقات (ضيق) لعرض المؤشرات والرسوم هنا.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const tablePanel = (
    <div className="min-w-0 order-1 xl:order-2 xl:max-h-[calc(100vh-8rem)] xl:flex xl:flex-col">
      <Card
        className={cn(
          'shadow-sm xl:flex xl:min-h-0 xl:flex-1 xl:flex-col',
        )}
      >
        <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
          <CardTitle className="text-base font-semibold">تنفيذات مكتملة</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
          <div className="grid max-w-full shrink-0 grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">تصفية بالمنتج</Label>
              <SearchableSelect
                options={productFilterOptions}
                value={filterProductId}
                onChange={setFilterProductId}
                placeholder="كل المنتجات"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">المشرف</Label>
              <SearchableSelect
                options={supervisorFilterOptions}
                value={filterSupervisorId}
                onChange={setFilterSupervisorId}
                placeholder="كل المشرفين"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">من تاريخ</Label>
                <input
                  type="date"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">إلى تاريخ</Label>
                <input
                  type="date"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          {isLoading ? (
            <LoadingSkeleton rows={6} type="card" />
          ) : filteredExecutions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تنفيذات في هذا التصفية.</p>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
                {filteredExecutions.map((e) => {
                  const supervisorLabel = resolveSupervisorLabel(e.supervisorId);
                  return (
                    <Card
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      data-state={selectedId === e.id ? 'selected' : undefined}
                      className={cn('border shadow-sm', rowSelectClass(e.id))}
                      onClick={() => setSelectedId(e.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setSelectedId(e.id);
                        }
                      }}
                    >
                      <CardContent className="space-y-3 p-4">
                        <div className="break-words text-start font-medium leading-snug">{productName(e.productId)}</div>
                        <div className="grid grid-cols-2 gap-2 text-sm tabular-nums">
                          <div>
                            <span className="text-muted-foreground">الكمية</span>
                            <div className="font-medium">{e.quantity}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">إصدار الخطة</span>
                            <div className="font-medium">{e.planVersion}</div>
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">المشرف</span>
                            <div className="font-medium leading-snug" title={supervisorLabel}>
                              {supervisorLabel}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">كفاءة الزمن %</span>
                            <div className="font-medium">
                              {e.timeEfficiency != null ? `${(e.timeEfficiency * 100).toFixed(1)}` : '—'}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">تكلفة الوحدة</span>
                            <div className="font-medium">{e.costPerUnit != null ? e.costPerUnit.toFixed(2) : '—'}</div>
                          </div>
                          <div className="col-span-2 text-sm text-muted-foreground tabular-nums">
                            {formatRoutingFirestoreInstant(e.finishedAt)}
                          </div>
                        </div>
                        {can('routing.manage') && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="w-full"
                            disabled={deleteExecutionMut.isPending}
                            onClick={(ev) => void handleDeleteExecution(ev, e)}
                          >
                            حذف
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
          {!isLoading && filteredExecutions.length > 0 && (
            <p className="shrink-0 text-xs text-muted-foreground">
              <span className="hidden xl:inline">على الشاشات العريضة: القائمة بجانب التفاصيل. </span>
              اختر بطاقة لتحديث اللوحة.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const showEmptyGlobal = !isLoading && completed.length === 0;

  return (
    <div className="erp-ds-clean w-full min-w-0 space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <PageHeader
            title="تحليلات مسارات الإنتاج"
            subtitle="مقارنة القياسي بالفعلي والتكلفة حسب الخطوة — قائمة التنفيذات بجانب لوحة التفاصيل"
            icon="bar_chart"
            iconBg="bg-sky-500/12"
            iconColor="text-sky-700 dark:text-sky-400"
          />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => navigate('/production/routing')}>
            مسارات الإنتاج
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['productionRouting', 'completed'] });
              void execQuery.refetch();
            }}
          >
            تحديث القائمة والتفاصيل
          </Button>
        </div>
      </div>

      {showEmptyGlobal ? (
        <Card className="shadow-sm">
          <CardContent className="py-12">
            <p className="text-center text-sm text-muted-foreground">لا توجد تنفيذات مكتملة بعد.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPIBox
              icon="fact_check"
              label="تنفيذات معروضة"
              value={analyticsKpis.count}
              colorClass="bg-sky-500/15 text-sky-700 dark:text-sky-400"
            />
            <KPIBox
              icon="inventory_2"
              label="إجمالي الكمية"
              value={analyticsKpis.totalQty}
              colorClass="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            />
            <KPIBox
              icon="speed"
              label="متوسط كفاءة الزمن"
              value={`${(analyticsKpis.avgTimeEfficiency * 100).toFixed(1)}%`}
              colorClass="bg-violet-500/15 text-violet-700 dark:text-violet-300"
            />
            <KPIBox
              icon="payments"
              label="إجمالي التكلفة"
              value={analyticsKpis.totalCost.toFixed(2)}
              colorClass="bg-amber-500/15 text-amber-800 dark:text-amber-300"
            />
          </div>
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] xl:gap-8">
            {detailPanel}
            {tablePanel}
          </div>
        </>
      )}
    </div>
  );
};

export default RoutingAnalyticsPage;
