import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { LoadingSkeleton } from '@/modules/production/components/UI';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/UI';
import { routingQueryKeys } from '../hooks/routingQueries';
import { useStopwatch } from '../hooks/useStopwatch';
import { routingPlanService } from '../services/routingPlanService';
import { routingStepService } from '../services/routingStepService';
import { routingExecutionService } from '../services/routingExecutionService';
import { formatDurationSeconds } from '../domain/calculations';
import type { ProductionRoutingStep } from '../types';
import { RoutingExecutionPrint } from '../components/RoutingExecutionPrint';
import { exportAsImage, exportToPDF, shareToWhatsApp, type ShareResult } from '@/utils/reportExport';

type Phase = 'pick' | 'preview' | 'run' | 'done';

export const ExecutionPage: React.FC = () => {
  const { executionId = '' } = useParams<{ executionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useTenantNavigate();
  const qc = useQueryClient();
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const hourlyRate = Number(laborSettings?.hourlyRate ?? 0);

  const isNew = executionId === 'new';
  const initialProduct = (searchParams.get('productId') ?? '').trim();

  const [phase, setPhase] = useState<Phase>(() => (isNew ? (initialProduct ? 'preview' : 'pick') : 'run'));
  const [productId, setProductId] = useState(initialProduct);
  const [quantity, setQuantity] = useState(1);
  const [stepIndex, setStepIndex] = useState(0);
  const [actualWorkers, setActualWorkers] = useState(1);
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  const {
    elapsedSeconds,
    isRunning,
    startOrResume,
    pause,
    reset,
    syncFromSeconds,
    stopAndCaptureSeconds,
  } = useStopwatch();

  const [previewPlan, setPreviewPlan] = useState<Awaited<ReturnType<typeof routingPlanService.getActivePlanForProduct>>>(null);
  const [previewSteps, setPreviewSteps] = useState<ProductionRoutingStep[]>([]);

  const execQuery = useQuery({
    queryKey: routingQueryKeys.execution(executionId),
    queryFn: () => routingExecutionService.getById(executionId),
    enabled: !isNew,
  });
  const stepsQuery = useQuery({
    queryKey: routingQueryKeys.executionSteps(executionId),
    queryFn: () => routingExecutionService.getExecutionSteps(executionId),
    enabled: !isNew,
  });

  const execution = execQuery.data;
  const execSteps = stepsQuery.data ?? [];

  const executionProductName = useMemo(
    () => (execution ? products.find((p) => p.id === execution.productId)?.name ?? execution.productId : ''),
    [execution, products],
  );

  const executionSupervisorName = useMemo(() => {
    if (!execution) return '';
    const emp = _rawEmployees.find((e) => e.userId === execution.supervisorId);
    return emp?.name?.trim() || '—';
  }, [execution, _rawEmployees]);

  const showShareFeedback = useCallback((result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل الصورة ونسخها — افتح المحادثة والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التقرير — أرفقها في محادثة واتساب';
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 6000);
  }, []);

  const handleExecExportPdf = useCallback(async () => {
    if (!printRef.current || !execution) return;
    setExporting(true);
    try {
      await exportToPDF(printRef.current, `تنفيذ-مسار-${executionProductName || execution.id}`, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: printTemplate?.copies,
      });
    } finally {
      setExporting(false);
    }
  }, [execution, executionProductName, printTemplate]);

  const handleExecExportImage = useCallback(async () => {
    if (!printRef.current || !execution) return;
    setExporting(true);
    try {
      await exportAsImage(printRef.current, `تنفيذ-مسار-${executionProductName || execution.id}`);
    } finally {
      setExporting(false);
    }
  }, [execution, executionProductName]);

  const handleExecShareWhatsApp = useCallback(async () => {
    if (!printRef.current || !execution) return;
    setExporting(true);
    try {
      const result = await shareToWhatsApp(
        printRef.current,
        `تنفيذ مسار - ${executionProductName || execution.productId}`,
      );
      showShareFeedback(result);
    } finally {
      setExporting(false);
    }
  }, [execution, executionProductName, showShareFeedback]);

  const startMut = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('no user');
      const plan = await routingPlanService.getActivePlanForProduct(productId);
      if (!plan) throw new Error('no active plan');
      const std = await routingStepService.getByPlanId(plan.id);
      if (std.length === 0) throw new Error('no steps');
      const id = await routingExecutionService.createDraft({
        productId,
        planId: plan.id,
        planVersion: plan.version,
        quantity,
        supervisorId: uid,
        standardSteps: std,
      });
      await routingExecutionService.startExecution(id);
      return id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ['productionRouting'] });
      navigate(`/production/routing/execution/${id}`, { replace: true });
    },
  });

  const completeMut = useMutation({
    mutationFn: async () => {
      await routingExecutionService.completeExecution(executionId, hourlyRate);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['productionRouting'] });
      setPhase('done');
    },
  });

  useEffect(() => {
    if (isNew || !execution || execSteps.length === 0) return;
    if (execution.status === 'completed') {
      setPhase('done');
      return;
    }
    setPhase('run');
  }, [isNew, execution, execSteps.length]);

  const currentStepRow = execSteps[stepIndex];
  useEffect(() => {
    if (!currentStepRow) return;
    syncFromSeconds(currentStepRow.actualDurationSeconds ?? 0);
    setActualWorkers(currentStepRow.actualWorkersCount ?? currentStepRow.standardWorkersCount);
  }, [
    stepIndex,
    currentStepRow?.id,
    currentStepRow?.actualDurationSeconds,
    currentStepRow?.actualWorkersCount,
    currentStepRow?.standardWorkersCount,
    syncFromSeconds,
  ]);

  const loadPreview = useCallback(async () => {
    const plan = await routingPlanService.getActivePlanForProduct(productId);
    setPreviewPlan(plan);
    if (!plan) {
      setPreviewSteps([]);
      return;
    }
    const st = await routingStepService.getByPlanId(plan.id);
    setPreviewSteps(st);
  }, [productId]);

  useEffect(() => {
    if (phase === 'preview' && productId) void loadPreview();
  }, [phase, productId, loadPreview]);

  const saveCurrentStepAndAdvance = useCallback(async () => {
    if (isNew || !execution || execution.status === 'completed') return;
    const row = execSteps[stepIndex];
    if (!row) return;
    const actualDurationSeconds = stopAndCaptureSeconds();
    await routingExecutionService.patchExecutionStep(row.id, {
      actualDurationSeconds,
      actualWorkersCount: actualWorkers,
    });
    await qc.invalidateQueries({ queryKey: routingQueryKeys.executionSteps(executionId) });
    if (stepIndex < execSteps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      await completeMut.mutateAsync();
    }
  }, [actualWorkers, completeMut, execSteps, execution, executionId, isNew, qc, stepIndex, stopAndCaptureSeconds]);

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name })),
    [products],
  );

  const pickedProductLabel = useMemo(() => {
    if (!productId) return '';
    const n = products.find((p) => p.id === productId)?.name?.trim();
    if (n) return n;
    const raw = _rawProducts.find((p) => p.id === productId)?.name?.trim();
    return raw || productId;
  }, [productId, products, _rawProducts]);

  const timeBetter =
    currentStepRow && elapsedSeconds > 0 ? elapsedSeconds <= currentStepRow.standardDurationSeconds : null;
  const workerBetter =
    currentStepRow && actualWorkers >= 0 ? actualWorkers <= currentStepRow.standardWorkersCount : null;

  if (!can('routing.execute')) {
    return (
      <div className="erp-ds-clean w-full min-w-0">
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              ليس لديك صلاحية تنفيذ مسارات الإنتاج.
            </div>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/production/routing')}>
              مسارات الإنتاج
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isNew && execQuery.isLoading) {
    return (
      <div className="erp-ds-clean mx-auto w-full min-w-0 max-w-lg">
        <LoadingSkeleton rows={8} type="card" />
      </div>
    );
  }

  if (!isNew && !execution) {
    return (
      <div className="erp-ds-clean mx-auto w-full min-w-0 max-w-lg space-y-4">
        <PageHeader title="تنفيذ غير موجود" subtitle="قد يكون الرابط قديماً أو تم حذف السجل" icon="factory" />
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <p className="text-center text-sm text-muted-foreground">لم يتم العثور على التنفيذ.</p>
            <Button type="button" size="lg" className="w-full min-h-11" onClick={() => navigate('/production/routing')}>
              العودة لمسارات الإنتاج
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === 'done' && execution?.status === 'completed') {
    return (
      <div className="erp-ds-clean mx-auto w-full min-w-0 max-w-lg space-y-5">
        <PageHeader
          title="اكتمل التنفيذ"
          subtitle="تم حفظ الأداء والتكلفة — يمكنك التصدير أو المشاركة كما في الإدخال السريع"
          icon="check"
          iconBg="bg-emerald-500/15"
          iconColor="text-emerald-600 dark:text-emerald-400"
          backAction={{ onClick: () => navigate('/production/routing'), label: 'مسارات الإنتاج' }}
        />

        {shareToast && (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            <span className="material-icons-round shrink-0 text-lg text-emerald-600 dark:text-emerald-400">share</span>
            <p className="min-w-0 flex-1 leading-relaxed">{shareToast}</p>
            <button
              type="button"
              onClick={() => setShareToast(null)}
              className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
              aria-label="إغلاق"
            >
              <span className="material-icons-round text-base">close</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <span className="material-icons-round text-2xl text-emerald-600 dark:text-emerald-400">check_circle</span>
          <div>
            <p className="font-bold text-emerald-800 dark:text-emerald-200">تم حفظ التنفيذ بنجاح</p>
            <p className="text-sm text-emerald-700/90 dark:text-emerald-300/90">يمكنك تصدير التقرير أو مشاركته عبر واتساب.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="secondary" disabled={exporting} onClick={() => void handleExecExportPdf()} className="w-full sm:w-auto">
            {exporting ? (
              <span className="material-icons-round animate-spin text-sm">refresh</span>
            ) : (
              <span className="material-icons-round text-lg">picture_as_pdf</span>
            )}
            تصدير PDF
          </Button>
          <Button variant="secondary" disabled={exporting} onClick={() => void handleExecExportImage()} className="w-full sm:w-auto">
            <span className="material-icons-round text-lg">image</span>
            تصدير كصورة
          </Button>
          <Button variant="outline" disabled={exporting} onClick={() => void handleExecShareWhatsApp()} className="w-full sm:w-auto">
            <span className="material-icons-round text-lg">share</span>
            مشاركة عبر WhatsApp
          </Button>
        </div>

        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-2 border-b border-border pb-2 text-xs font-bold text-muted-foreground">
              <span className="material-icons-round text-sm">visibility</span>
              معاينة سريعة
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-[10px] font-semibold text-muted-foreground">المنتج</p>
                <p className="mt-1 font-semibold leading-snug text-foreground">{executionProductName || '—'}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-[10px] font-semibold text-muted-foreground">الكمية</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{execution.quantity}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-[10px] font-semibold text-muted-foreground">كفاءة الزمن</p>
                <p className="mt-1 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {execution.timeEfficiency != null ? `${(execution.timeEfficiency * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-[10px] font-semibold text-muted-foreground">تكلفة الوحدة</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {execution.costPerUnit != null ? execution.costPerUnit.toFixed(2) : '—'}
                </p>
              </div>
            </div>
            {execution.timeEfficiency != null &&
              execution.laborEfficiency != null &&
              Math.abs(execution.timeEfficiency - execution.laborEfficiency) > 0.001 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  كفاءة العمالة (إصدار قديم): {(execution.laborEfficiency * 100).toFixed(1)}%
                </p>
              )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:flex-1"
            onClick={() => navigate(`/production/routing/execution/new?productId=${encodeURIComponent(execution.productId)}`)}
          >
            <span className="material-icons-round text-lg">add</span>
            تنفيذ جديد لنفس المنتج
          </Button>
          <Button size="lg" className="w-full min-h-12 text-base sm:flex-1" onClick={() => navigate('/production/routing')}>
            العودة للمسارات
          </Button>
        </div>

        <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
          <RoutingExecutionPrint
            ref={printRef}
            execution={execution}
            steps={execSteps}
            productName={executionProductName}
            supervisorName={executionSupervisorName}
            printSettings={printTemplate}
          />
        </div>
      </div>
    );
  }

  if (isNew && phase === 'pick') {
    return (
      <div className="erp-ds-clean mx-auto w-full min-w-0 max-w-lg space-y-6">
        <PageHeader
          title="تنفيذ مسار"
          subtitle="الخطوة 1 — المنتج والكمية"
          icon="factory"
          iconBg="bg-sky-500/15"
          iconColor="text-sky-600 dark:text-sky-400"
          backAction={{ onClick: () => navigate('/production/routing'), label: 'مسارات الإنتاج' }}
        />
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-muted-foreground">المنتج</Label>
              <SearchableSelect
                options={productOptions}
                value={productId}
                onChange={setProductId}
                placeholder="اختر المنتج"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-muted-foreground">الكمية</Label>
              <Input
                type="number"
                min={1}
                className="h-12 text-lg tabular-nums"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <Button size="lg" className="w-full min-h-14 text-lg" disabled={!productId} onClick={() => setPhase('preview')}>
              التالي
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isNew && phase === 'preview') {
    return (
      <div className="erp-ds-clean mx-auto w-full min-w-0 max-w-lg space-y-6">
        <PageHeader
          title="خطة المسار النشطة"
          subtitle="الخطوة 2 — مراجعة سريعة"
          icon="factory"
          iconBg="bg-amber-500/12"
          iconColor="text-amber-800 dark:text-amber-300"
          backAction={{ onClick: () => setPhase('pick'), label: 'الخطوة السابقة' }}
        />
        <Card className="shadow-sm">
          <CardContent className="space-y-6 p-4 sm:p-6">
            <p className="text-sm font-semibold text-foreground">
              المنتج: <span className="font-bold text-primary">{pickedProductLabel}</span>
            </p>
            {!previewPlan && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
                لا توجد خطة مسار نشطة لهذا المنتج. أنشئ مساراً من «مسارات الإنتاج» أولاً.
              </div>
            )}
            {previewPlan && (
              <div className="space-y-2 text-sm">
                <p>
                  الإصدار <span className="font-bold tabular-nums">{previewPlan.version}</span> — الزمن القياسي{' '}
                  {formatDurationSeconds(previewPlan.totalTimeSeconds)}
                </p>
                <ul className="list-disc space-y-1 pe-5 text-muted-foreground">
                  {previewSteps.map((s) => (
                    <li key={s.id}>
                      {s.name} — {formatDurationSeconds(s.durationSeconds)} — {s.workersCount} عامل
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                className="w-full min-h-14 text-lg"
                disabled={!previewPlan || previewSteps.length === 0 || startMut.isPending}
                onClick={() => void startMut.mutateAsync()}
              >
                {startMut.isPending ? 'جاري البدء…' : 'بدء التنفيذ'}
              </Button>
              <Button type="button" variant="outline" size="lg" className="w-full min-h-12" onClick={() => setPhase('pick')}>
                رجوع
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }


  if (!isNew && currentStepRow) {
    return (
      <div className="erp-ds-clean mx-auto w-full min-w-0 max-w-lg space-y-6 pb-24 md:pb-10">
        <PageHeader
          title={currentStepRow.name}
          subtitle={`خطوة ${stepIndex + 1} من ${execSteps.length}`}
          icon="factory"
          iconBg="bg-violet-500/12"
          iconColor="text-violet-700 dark:text-violet-300"
          backAction={{ onClick: () => navigate('/production/routing'), label: 'مسارات الإنتاج' }}
        />
        <Card className="shadow-sm">
          <CardContent className="space-y-6 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-[var(--color-muted)]/50 p-3">
              <div className="text-[var(--color-text-muted)] text-xs mb-1">الزمن القياسي</div>
              <div className="text-lg font-bold tabular-nums">{formatDurationSeconds(currentStepRow.standardDurationSeconds)}</div>
            </div>
            <div className="rounded-lg bg-[var(--color-muted)]/50 p-3">
              <div className="text-[var(--color-text-muted)] text-xs mb-1">العمال القياسي</div>
              <div className="text-lg font-bold tabular-nums">{currentStepRow.standardWorkersCount}</div>
            </div>
            </div>
            <div className="space-y-4">
            <div>
              <div className="mb-2 block text-sm font-bold">الزمن الفعلي</div>
              <div
                className={`rounded-2xl border-2 bg-[var(--color-muted)]/30 px-4 py-6 text-center mb-3 ${
                  timeBetter === false
                    ? 'border-rose-400/80'
                    : timeBetter === true
                      ? 'border-emerald-400/80'
                      : 'border-[var(--color-border)]'
                }`}
              >
                <div className="text-3xl sm:text-4xl font-bold tabular-nums tracking-tight text-[var(--color-text)]">
                  {formatDurationSeconds(elapsedSeconds)}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1 tabular-nums">{elapsedSeconds} ثانية</div>
                {isRunning && (
                  <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-2 animate-pulse">
                    القياس قيد التشغيل
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  size="lg"
                  variant={isRunning ? 'secondary' : 'default'}
                  className="min-h-11 gap-1.5"
                  disabled={isRunning}
                  onClick={startOrResume}
                >
                  <Play className="size-4 shrink-0" aria-hidden />
                  <span className="text-xs sm:text-sm">{elapsedSeconds > 0 ? 'استئناف' : 'بدء'}</span>
                </Button>
                <Button type="button" size="lg" variant="outline" className="min-h-11 gap-1.5" disabled={!isRunning} onClick={pause}>
                  <Pause className="size-4 shrink-0" aria-hidden />
                  <span className="text-xs sm:text-sm">إيقاف</span>
                </Button>
                <Button type="button" size="lg" variant="outline" className="min-h-11 gap-1.5" disabled={isRunning || elapsedSeconds === 0} onClick={reset}>
                  <RotateCcw className="size-4 shrink-0" aria-hidden />
                  <span className="text-xs sm:text-sm">تصفير</span>
                </Button>
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-sm font-semibold text-muted-foreground">تعديل يدوي (ثانية)</Label>
              <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                يُحدَّث من المؤقت أعلاه؛ عطّل أثناء القياس. القيمة هنا تُحفَظ مع «التالي».
              </p>
              <Input
                type="number"
                min={0}
                disabled={isRunning}
                className={`h-12 text-lg tabular-nums ${timeBetter === false ? 'border-rose-400 ring-rose-200' : ''} ${timeBetter === true ? 'border-emerald-400 ring-emerald-200' : ''}`}
                value={elapsedSeconds}
                onChange={(e) => syncFromSeconds(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <Label className="mb-1 block text-sm font-semibold">العمال الفعلي</Label>
              <Input
                type="number"
                min={0}
                className={`h-14 text-xl tabular-nums ${workerBetter === false ? 'border-rose-400' : ''} ${workerBetter === true ? 'border-emerald-400' : ''}`}
                value={actualWorkers}
                onChange={(e) => setActualWorkers(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            </div>
            <div className="mt-2 flex flex-col gap-2">
            <Button
              size="lg"
              className="w-full min-h-14 text-lg"
              disabled={completeMut.isPending}
              onClick={() => void saveCurrentStepAndAdvance()}
            >
              {stepIndex < execSteps.length - 1 ? 'التالي' : 'إنهاء وحفظ'}
            </Button>
            {stepIndex > 0 && (
              <Button type="button" variant="outline" size="lg" className="w-full min-h-12" onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>
                السابق
              </Button>
            )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean mx-auto w-full min-w-0 max-w-lg">
      <LoadingSkeleton rows={6} type="card" />
    </div>
  );
};

export default ExecutionPage;