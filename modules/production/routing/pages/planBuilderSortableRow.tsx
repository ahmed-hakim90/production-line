import React, { useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatDurationSeconds } from '../domain/calculations';
import { useStopwatch } from '../hooks/useStopwatch';
import type { RoutingStepDraft } from '../types';

/** Matches header row in PlanBuilderPage (lg breakpoint). */
export const routingStepLgGridClass =
  'lg:grid-cols-[2.75rem_2.5rem_minmax(0,1fr)_5.5rem_minmax(13rem,1fr)_2.75rem]';

export function newRoutingDraft(): RoutingStepDraft {
  return {
    clientKey: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`,
    name: '',
    durationSeconds: 0,
    workersCount: 1,
  };
}

export function SortableRoutingStepRow({
  row,
  stepIndex,
  readonly,
  onChange,
  onRemove,
}: {
  row: RoutingStepDraft;
  stepIndex: number;
  readonly: boolean;
  onChange: (k: string, patch: Partial<RoutingStepDraft>) => void;
  onRemove: (k: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.clientKey, disabled: readonly });
  const {
    elapsedSeconds,
    isRunning,
    startOrResume,
    pause,
    reset,
    syncFromSeconds,
    stopAndCaptureSeconds,
  } = useStopwatch();

  useEffect(() => {
    if (!isRunning) syncFromSeconds(row.durationSeconds);
  }, [row.durationSeconds, isRunning, syncFromSeconds]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const applyMeasuredTime = () => {
    const s = stopAndCaptureSeconds();
    onChange(row.clientKey, { durationSeconds: s });
  };

  const timeControls = !readonly && (
    <>
      {isRunning && (
        <span
          className="shrink-0 text-[11px] font-semibold tabular-nums text-emerald-600 animate-pulse dark:text-emerald-400"
          aria-live="polite"
        >
          {formatDurationSeconds(elapsedSeconds)}
        </span>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-9 shrink-0"
          disabled={isRunning}
          title={elapsedSeconds > 0 ? 'استئناف' : 'شغّل التايمر'}
          aria-label={elapsedSeconds > 0 ? 'استئناف' : 'شغّل التايمر'}
          onClick={startOrResume}
        >
          <Play className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-9 shrink-0"
          disabled={!isRunning}
          title="إيقاف مؤقت"
          aria-label="أوقف التايمر"
          onClick={pause}
        >
          <Pause className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-9 shrink-0"
          disabled={isRunning || elapsedSeconds === 0}
          title="صفر التايمر"
          aria-label="صفر التايمر"
          onClick={reset}
        >
          <RotateCcw className="size-4" aria-hidden />
        </Button>
      </div>
      <Button
        type="button"
        size="icon"
        variant="outline"
        title="اعتماد الوقت"
        aria-label="اعتماد الوقت"
        className="size-9 shrink-0 border-emerald-600 bg-emerald-600 text-white shadow-sm hover:border-emerald-700 hover:bg-emerald-700 hover:text-white focus-visible:ring-emerald-500 dark:border-emerald-600 dark:bg-emerald-600 dark:hover:border-emerald-500 dark:hover:bg-emerald-500"
        onClick={applyMeasuredTime}
      >
        <Check className="size-4" aria-hidden />
      </Button>
    </>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-dragging={isDragging || undefined}
      className={cn(
        'grid grid-cols-1 gap-3 rounded-lg border bg-card p-3 shadow-sm transition-colors sm:p-4',
        routingStepLgGridClass,
        'lg:items-center lg:gap-x-2 lg:gap-y-0',
        'data-[dragging=true]:bg-muted/60 data-[dragging=true]:shadow-md',
        isDragging && 'relative z-[1]',
      )}
    >
      <div className="flex items-center gap-2 lg:justify-center">
        {!readonly ? (
          <button
            type="button"
            className={cn(
              'inline-flex size-9 items-center justify-center rounded-md text-muted-foreground',
              'hover:bg-accent hover:text-accent-foreground',
              'cursor-grab active:cursor-grabbing touch-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
            )}
            aria-label="سحب لإعادة ترتيب الخطوة"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        ) : (
          <span className="hidden size-9 shrink-0 lg:inline-block" aria-hidden />
        )}
        <span className="inline-flex min-w-7 items-center justify-center rounded-md bg-muted px-1.5 py-0.5 tabular-nums text-xs font-medium text-muted-foreground lg:hidden">
          {stepIndex}
        </span>
      </div>

      <div className="hidden items-center justify-center lg:flex">
        <span className="inline-flex min-w-7 items-center justify-center rounded-md bg-muted px-1.5 py-0.5 tabular-nums text-xs font-medium text-muted-foreground">
          {stepIndex}
        </span>
      </div>

      <div className="min-w-0">
        <Label htmlFor={`step-name-${row.clientKey}`} className="mb-1.5 block lg:sr-only">
          الاسم
        </Label>
        <Input
          id={`step-name-${row.clientKey}`}
          dir="rtl"
          className="h-9 min-w-0"
          value={row.name}
          readOnly={readonly}
          placeholder="مثال: تجهيز، لحام، فحص…"
          aria-label={`الاسم — الخطوة ${stepIndex}`}
          onChange={(e) => onChange(row.clientKey, { name: e.target.value })}
        />
      </div>

      <div className="min-w-0">
        <Label htmlFor={`step-workers-${row.clientKey}`} className="mb-1.5 block lg:sr-only">
          عدد العمال
        </Label>
        <Input
          id={`step-workers-${row.clientKey}`}
          type="number"
          min={readonly ? 0 : 1}
          inputMode="numeric"
          className="h-9 max-w-full tabular-nums lg:max-w-[5.5rem]"
          readOnly={readonly}
          value={row.workersCount}
          aria-label={`عدد العمال — الخطوة ${stepIndex}`}
          onChange={(e) => onChange(row.clientKey, { workersCount: Math.max(readonly ? 0 : 1, Number(e.target.value) || 0) })}
        />
      </div>

      <div className="min-w-0">
        <Label htmlFor={`step-dur-${row.clientKey}`} className="mb-1.5 block lg:sr-only">
          <span className="block">زمن الخطوة</span>
          <span className="text-xs font-normal text-muted-foreground">بالثواني</span>
        </Label>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" dir="rtl">
          <Input
            id={`step-dur-${row.clientKey}`}
            type="number"
            min={0}
            inputMode="numeric"
            className="h-9 min-w-0 flex-1 tabular-nums sm:min-w-[5rem]"
            readOnly={readonly}
            disabled={!readonly && isRunning}
            value={row.durationSeconds}
            aria-label={`زمن الخطوة بالثواني — الخطوة ${stepIndex}`}
            onChange={(e) => onChange(row.clientKey, { durationSeconds: Number(e.target.value) || 0 })}
          />
          {timeControls}
        </div>
      </div>

      <div className="flex justify-end lg:justify-center">
        {!readonly && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`حذف الخطوة ${stepIndex}`}
            onClick={() => onRemove(row.clientKey)}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
