import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '../../../components/PageHeader';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import {
  isValidDispatchBarcode,
  normalizeBostaBarcode,
  onlineDispatchService,
} from '../services/onlineDispatchService';
import { OnlineCameraBarcodeScanner } from '../components/OnlineCameraBarcodeScanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from '../../../components/Toast';
import { cn } from '@/lib/utils';
import type { OnlineDispatchStatus } from '../../../types';

type ScanMode = 'warehouse' | 'post';

const SESSION_MAX = 40;

type SessionScanRow = {
  clientKey: string;
  docId: string;
  barcode: string;
  status: OnlineDispatchStatus;
  scannedAtMs: number;
  /** Which scan screen recorded this row */
  phase: 'warehouse' | 'post';
};
type InputMode = 'manual' | 'camera';

function playFeedbackTone(type: 'success' | 'error') {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = type === 'success' ? 'sine' : 'square';
  oscillator.frequency.value = type === 'success' ? 880 : 220;
  gainNode.gain.value = 0.0001;
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  const now = ctx.currentTime;
  gainNode.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  oscillator.start(now);
  oscillator.stop(now + 0.12);
  oscillator.onended = () => {
    void ctx.close().catch(() => {});
  };
}

/** Idle delay before auto-submit (any barcode length); increase if manual typing triggers too early. */
const WEDGE_DEBOUNCE_MS = 400;

/** iOS/Safari requires getUserMedia inside the user gesture; starting camera only in useEffect breaks the permission prompt. */
async function preflightCameraPermission(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('المتصفح لا يدعم الكاميرا أو الموقع ليس آمناً (استخدم HTTPS)');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
  });
  stream.getTracks().forEach((t) => t.stop());
}

function cameraPreflightErrorMessage(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      return 'لم يُسمح بالكاميرا — اسمح للموقع من إعدادات المتصفح أو أيقونة القفل بجانب العنوان';
    }
    if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
      return 'لم يُعثر على كاميرا على هذا الجهاز';
    }
    if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
      return 'الكاميرا مستخدمة من تطبيق آخر أو غير متاحة';
    }
  }
  return e instanceof Error ? e.message : 'تعذر الوصول للكاميرا';
}

export const OnlineQuickScan: React.FC = () => {
  const { mode } = useParams<{ mode: string }>();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);

  const scanMode: ScanMode | null =
    mode === 'warehouse' || mode === 'post' ? mode : null;

  const allowed =
    scanMode === 'warehouse'
      ? can('onlineDispatch.handoffToWarehouse')
      : scanMode === 'post'
        ? can('onlineDispatch.handoffToPost')
        : false;

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [wedgeAutoSubmit, setWedgeAutoSubmit] = useState(true);
  const [cameraPriming, setCameraPriming] = useState(false);
  const [sessionScans, setSessionScans] = useState<SessionScanRow[]>([]);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  /** Post mode only: debounced lookup for «مسجّل أم لا». */
  const [postLookup, setPostLookup] = useState<
    'idle' | 'loading' | 'missing' | OnlineDispatchStatus
  >('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const wedgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postLookupGenRef = useRef(0);

  const canRevertWarehouseScan =
    Boolean(uid) && (can('onlineDispatch.manage') || can('onlineDispatch.handoffToWarehouse'));

  const selectCameraMode = useCallback(async () => {
    if (inputMode === 'camera') return;
    setCameraPriming(true);
    try {
      await preflightCameraPermission();
      setInputMode('camera');
    } catch (e) {
      toast.error(cameraPreflightErrorMessage(e));
    } finally {
      setCameraPriming(false);
    }
  }, [inputMode]);

  useEffect(() => {
    if (inputMode === 'manual') {
      inputRef.current?.focus();
    }
  }, [scanMode, inputMode]);

  useEffect(() => {
    if (scanMode !== 'post' || inputMode !== 'manual') {
      setPostLookup('idle');
      return;
    }
    const n = normalizeBostaBarcode(value);
    if (!isValidDispatchBarcode(n)) {
      setPostLookup('idle');
      return;
    }
    setPostLookup('loading');
    const gen = ++postLookupGenRef.current;
    const tid = window.setTimeout(() => {
      void onlineDispatchService.getByBarcode(n).then((row) => {
        if (gen !== postLookupGenRef.current) return;
        setPostLookup(row ? row.status : 'missing');
      });
    }, 320);
    return () => clearTimeout(tid);
  }, [value, scanMode, inputMode]);

  const runScan = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || !uid || !scanMode) return;
      setBusy(true);
      try {
        const normalized = normalizeBostaBarcode(trimmed);
        if (scanMode === 'warehouse') {
          await onlineDispatchService.applyWarehouseScan(uid, trimmed);
          toast.success('تم تسجيل التسليم للمخزن');
          const row = await onlineDispatchService.getByBarcode(normalized);
          if (row) {
            setSessionScans((prev) =>
              [
                {
                  clientKey: `${row.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  docId: row.id,
                  barcode: row.barcode,
                  status: row.status,
                  scannedAtMs: Date.now(),
                  phase: 'warehouse' as const,
                },
                ...prev,
              ].slice(0, SESSION_MAX),
            );
          }
        } else {
          await onlineDispatchService.applyPostScan(uid, trimmed);
          toast.success('تم تسجيل التسليم للبوسطة');
          const row = await onlineDispatchService.getByBarcode(normalized);
          if (row) {
            setSessionScans((prev) =>
              [
                {
                  clientKey: `${row.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  docId: row.id,
                  barcode: row.barcode,
                  status: row.status,
                  scannedAtMs: Date.now(),
                  phase: 'post' as const,
                },
                ...prev,
              ].slice(0, SESSION_MAX),
            );
          }
        }
        playFeedbackTone('success');
        setValue('');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'فشل المسح';
        toast.error(msg);
        playFeedbackTone('error');
      } finally {
        setBusy(false);
        if (inputMode === 'manual') {
          inputRef.current?.focus();
        }
      }
    },
    [scanMode, uid, inputMode],
  );

  const deleteWarehouseSessionRow = useCallback(
    async (entry: SessionScanRow) => {
      if (!uid || entry.phase !== 'warehouse' || entry.status !== 'at_warehouse') return;
      setDeletingKey(entry.clientKey);
      try {
        await onlineDispatchService.revertWarehouseHandoff(uid, entry.docId);
        toast.success('تم حذف مسح المخزن — عاد الباركود لانتظار أول مسح');
        setSessionScans((prev) => prev.filter((r) => r.clientKey !== entry.clientKey));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'فشل الحذف');
      } finally {
        setDeletingKey(null);
      }
    },
    [uid],
  );

  const onCameraDecoded = useCallback(
    (text: string) => {
      void runScan(text);
    },
    [runScan],
  );

  useEffect(() => {
    if (!wedgeAutoSubmit || inputMode !== 'manual' || busy) {
      if (wedgeTimerRef.current) {
        clearTimeout(wedgeTimerRef.current);
        wedgeTimerRef.current = null;
      }
      return;
    }
    const normalized = normalizeBostaBarcode(value);
    if (!isValidDispatchBarcode(normalized)) {
      return;
    }
    if (wedgeTimerRef.current) clearTimeout(wedgeTimerRef.current);
    wedgeTimerRef.current = setTimeout(() => {
      wedgeTimerRef.current = null;
      void runScan(value);
    }, WEDGE_DEBOUNCE_MS);
    return () => {
      if (wedgeTimerRef.current) {
        clearTimeout(wedgeTimerRef.current);
        wedgeTimerRef.current = null;
      }
    };
  }, [value, wedgeAutoSubmit, inputMode, busy, runScan]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void runScan(value);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  if (!scanMode) {
    return <Navigate to="/online" replace />;
  }

  if (!allowed) {
    return <Navigate to="/online" replace />;
  }

  return (
    <div className="erp-page max-w-lg mx-auto space-y-6 px-2 sm:px-0">
      <PageHeader
        title={scanMode === 'warehouse' ? 'مسح — تسليم للمخزن' : 'مسح — تسليم للبوسطة'}
        subtitle={
          scanMode === 'warehouse'
            ? 'أول مسح لهذا الباركود يُنشئ السجل ويُسجّل التسليم للمخزن — أو امسح رمز QR'
            : 'يُعرض أدناه هل الباركود مسجّل؛ ثم سجّل التسليم للبوسطة عند جاهزية الشحنة'
        }
        icon="search"
      />

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant={inputMode === 'manual' ? 'default' : 'outline'}
            className="h-12 flex-1 text-base"
            onClick={() => setInputMode('manual')}
          >
            إدخال / قارئ باركود
          </Button>
          <Button
            type="button"
            variant={inputMode === 'camera' ? 'default' : 'outline'}
            className="h-12 flex-1 text-base"
            disabled={busy || cameraPriming}
            onClick={() => void selectCameraMode()}
          >
            {cameraPriming ? 'جاري طلب الكاميرا…' : 'كاميرا الموبايل'}
          </Button>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          على الموبايل (خصوصاً Safari على آيفون) يجب السماح بالكاميرا من نافذة المتصفح عند الضغط أعلاه؛ إن لم تظهر، تحقق من إعدادات الموقع أو أن الصفحة تُفتح عبر HTTPS.
        </p>

        {inputMode === 'manual' ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              استخدم لوحة المفاتيح أو قارئ الباركود المتصل (يُدخل النص كلوحة مفاتيح): ركّز الحقل ثم امسح، وعادةً يُرسل القارئ زر Enter؛ أو اضغط «تسجيل».
            </p>
            <Input
              ref={inputRef}
              dir="ltr"
              className={cn('font-mono text-lg h-14 min-h-[3.5rem]', busy && 'opacity-60')}
              placeholder="الباركود…"
              value={value}
              onChange={onChange}
              onKeyDown={onKeyDown}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-bg)] p-3">
              <Checkbox
                id="wedge-auto"
                checked={wedgeAutoSubmit}
                onCheckedChange={(c) => setWedgeAutoSubmit(c === true)}
                disabled={busy}
              />
              <Label htmlFor="wedge-auto" className="text-sm font-normal leading-snug cursor-pointer">
                إرسال تلقائي بعد توقف الإدخال لحظة (لقارئ لا يُرسل Enter) — قد يتعارض مع الكتابة اليدوية البطيئة
              </Label>
            </div>
            {scanMode === 'post' && postLookup !== 'idle' && (
              <p
                className={cn(
                  'text-sm rounded-lg border px-3 py-2',
                  postLookup === 'loading' && 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)]',
                  postLookup === 'missing' && 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100',
                  postLookup === 'pending' && 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100',
                  postLookup === 'at_warehouse' && 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100',
                  postLookup === 'handed_to_post' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100',
                )}
                role="status"
              >
                {postLookup === 'loading' && 'جاري التحقق من السجل…'}
                {postLookup === 'missing' && 'غير مسجّل — لم يُمسح بعد من صفحة «تسليم للمخزن» بهذا الباركود'}
                {postLookup === 'pending' && 'مسجّل — في انتظار تسليم المخزن (امسح من صفحة المخزن أولًا)'}
                {postLookup === 'at_warehouse' && 'عند المخزن — يمكنك تسجيل التسليم للبوسطة'}
                {postLookup === 'handed_to_post' && 'تم تسجيل التسليم للبوسطة مسبقًا لهذا الباركود'}
              </p>
            )}
          </>
        ) : (
          <OnlineCameraBarcodeScanner
            active={inputMode === 'camera'}
            disabled={busy}
            onDecoded={onCameraDecoded}
            onScannerError={(m) => toast.error(m)}
          />
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {inputMode === 'manual' && (
            <Button type="button" className="h-12 min-w-[120px] text-base" onClick={() => void runScan(value)} disabled={busy}>
              تسجيل
            </Button>
          )}
          <Button type="button" variant="outline" className="h-12 min-w-[120px] text-base" onClick={() => navigate('/online')}>
            عودة للوحة
          </Button>
        </div>
      </div>

      <SessionScanList
        scanMode={scanMode}
        rows={sessionScans.filter((r) => r.phase === scanMode)}
        canDeleteWarehouse={canRevertWarehouseScan}
        deletingKey={deletingKey}
        onDeleteWarehouse={deleteWarehouseSessionRow}
      />
    </div>
  );
};

const PHASE_SESSION_TITLE: Record<ScanMode, string> = {
  warehouse: 'مسجّل في هذه الجلسة — تسليم للمخزن',
  post: 'مسجّل في هذه الجلسة — تسليم للبوسطة',
};

const STATUS_LABEL: Record<OnlineDispatchStatus, string> = {
  pending: 'في انتظار المخزن',
  at_warehouse: 'عند المخزن',
  handed_to_post: 'تم للبوسطة',
};

function SessionScanList(props: {
  scanMode: ScanMode;
  rows: SessionScanRow[];
  canDeleteWarehouse: boolean;
  deletingKey: string | null;
  onDeleteWarehouse: (row: SessionScanRow) => void;
}) {
  const { scanMode, rows, canDeleteWarehouse, deletingKey, onDeleteWarehouse } = props;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <div className="px-4 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] font-bold text-sm">
        {PHASE_SESSION_TITLE[scanMode]}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">لا توجد عمليات مسح في هذه الجلسة بعد</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]/70">
          {rows.map((row) => {
            const showDelete =
              scanMode === 'warehouse' &&
              row.phase === 'warehouse' &&
              row.status === 'at_warehouse' &&
              canDeleteWarehouse;
            return (
              <li
                key={row.clientKey}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 text-sm"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-mono text-xs font-semibold break-all dir-ltr text-left">{row.barcode}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {new Date(row.scannedAtMs).toLocaleString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}{' '}
                    · {STATUS_LABEL[row.status]}
                  </p>
                </div>
                {showDelete ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-destructive border-destructive/40 hover:bg-destructive/10"
                    disabled={deletingKey === row.clientKey}
                    onClick={() => void onDeleteWarehouse(row)}
                  >
                    {deletingKey === row.clientKey ? 'جاري…' : 'حذف المسح'}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {scanMode === 'warehouse' && (
        <p className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] border-t border-[var(--color-border)]/60 bg-[var(--color-bg)]/50">
          «حذف المسح» يتراجع عن تسليم المخزن فقط طالما لم يُسجَّل التسليم للبوسطة بعد، ويتطلب صلاحية الإدارة أو مسح المخزن.
        </p>
      )}
    </div>
  );
}
