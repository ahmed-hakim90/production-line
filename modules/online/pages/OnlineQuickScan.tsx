import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '../../../components/PageHeader';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import {
  getWarehouseDispatchDayStartMs,
  isValidDispatchBarcode,
  normalizeBostaBarcode,
  onlineDispatchService,
  onlineDispatchTsToMs,
  WAREHOUSE_DISPATCH_DAY_START_HOUR,
} from '../services/onlineDispatchService';
import { OnlineCameraBarcodeScanner } from '../components/OnlineCameraBarcodeScanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '../../../components/Toast';
import { cn } from '@/lib/utils';
import { ScanLine } from 'lucide-react';
import type { OnlineDispatchShipment, OnlineDispatchStatus } from '../../../types';
import { useFirestoreUserLabels } from '../utils/firestoreUserLabels';

type ScanMode = 'warehouse' | 'post';

type SessionScanRow = {
  clientKey: string;
  docId: string;
  barcode: string;
  status: OnlineDispatchStatus;
  scannedAtMs: number;
  /** Which scan screen recorded this row */
  phase: 'warehouse' | 'post';
  /** User who performed this phase's handoff (warehouse vs post), when stored on the shipment */
  actorUid?: string;
};
type InputMode = 'manual' | 'camera';

function shipmentToWarehouseSessionRow(r: OnlineDispatchShipment & { id: string }): SessionScanRow {
  const scannedAtMs = onlineDispatchTsToMs(r.handedToWarehouseAt) || Date.now();
  return {
    clientKey: `${r.id}-${scannedAtMs}`,
    docId: r.id,
    barcode: r.barcode,
    status: r.status,
    scannedAtMs,
    phase: 'warehouse',
    actorUid: r.handedToWarehouseByUid,
  };
}

function shipmentToPostSessionRow(r: OnlineDispatchShipment & { id: string }): SessionScanRow {
  const scannedAtMs = onlineDispatchTsToMs(r.handedToPostAt) || Date.now();
  return {
    clientKey: `${r.id}-${scannedAtMs}`,
    docId: r.id,
    barcode: r.barcode,
    status: r.status,
    scannedAtMs,
    phase: 'post',
    actorUid: r.handedToPostByUid,
  };
}

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
      ? can('onlineDispatch.handoffToWarehouse') || can('onlineDispatch.manage')
      : scanMode === 'post'
        ? can('onlineDispatch.handoffToPost') || can('onlineDispatch.manage')
        : false;

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [cameraPriming, setCameraPriming] = useState(false);
  /** Warehouse: server list — `handedToWarehouseAt` within dispatch day (from 08:00 local). */
  const [warehouseDayRows, setWarehouseDayRows] = useState<SessionScanRow[]>([]);
  const [warehouseListLoading, setWarehouseListLoading] = useState(false);
  /** Post: server list — `handedToPostAt` within the same dispatch day. */
  const [postDayRows, setPostDayRows] = useState<SessionScanRow[]>([]);
  const [postListLoading, setPostListLoading] = useState(false);
  /** Recompute dispatch-day start after 08:00 rollover without full reload. */
  const [dispatchDayClockTick, setDispatchDayClockTick] = useState(0);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  /** Post mode only: debounced lookup for «مسجّل أم لا». */
  const [postLookup, setPostLookup] = useState<
    'idle' | 'loading' | 'missing' | OnlineDispatchStatus
  >('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const wedgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postLookupGenRef = useRef(0);
  /** Prevents overlapping Firestore runs while the camera keeps decoding frames. */
  const cameraScanLockRef = useRef(false);

  const canRevertWarehouseScan =
    Boolean(uid) && (can('onlineDispatch.manage') || can('onlineDispatch.handoffToWarehouse'));

  const dispatchDayStartMs = useMemo(
    () => getWarehouseDispatchDayStartMs(Date.now()),
    [dispatchDayClockTick],
  );

  useEffect(() => {
    const id = window.setInterval(() => setDispatchDayClockTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadWarehouseDispatchDayList = useCallback(async () => {
    if (!uid) return;
    setWarehouseListLoading(true);
    try {
      const rows = await onlineDispatchService.listWarehouseHandoffsForDispatchDay();
      setWarehouseDayRows(rows.map(shipmentToWarehouseSessionRow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر تحميل قائمة المخزن');
    } finally {
      setWarehouseListLoading(false);
    }
  }, [uid]);

  const loadPostDispatchDayList = useCallback(async () => {
    if (!uid) return;
    setPostListLoading(true);
    try {
      const rows = await onlineDispatchService.listPostHandoffsForDispatchDay();
      setPostDayRows(rows.map(shipmentToPostSessionRow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر تحميل قائمة البوسطة');
    } finally {
      setPostListLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (scanMode !== 'warehouse' || !uid) return;
    void loadWarehouseDispatchDayList();
  }, [scanMode, uid, dispatchDayStartMs, loadWarehouseDispatchDayList]);

  useEffect(() => {
    if (scanMode !== 'post' || !uid) return;
    void loadPostDispatchDayList();
  }, [scanMode, uid, dispatchDayStartMs, loadPostDispatchDayList]);

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
      const isManual = inputMode === 'manual';
      if (isManual) setBusy(true);
      try {
        if (scanMode === 'warehouse') {
          await onlineDispatchService.applyWarehouseScan(uid, trimmed);
          toast.success('تم تسجيل التسليم للمخزن');
          await loadWarehouseDispatchDayList();
        } else {
          await onlineDispatchService.applyPostScan(uid, trimmed);
          toast.success('تم تسجيل التسليم للبوسطة');
          await loadPostDispatchDayList();
        }
        playFeedbackTone('success');
        setValue('');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'فشل المسح';
        toast.error(msg);
        playFeedbackTone('error');
      } finally {
        if (isManual) setBusy(false);
        if (isManual) inputRef.current?.focus();
      }
    },
    [scanMode, uid, inputMode, loadWarehouseDispatchDayList, loadPostDispatchDayList],
  );

  const deleteWarehouseSessionRow = useCallback(
    async (entry: SessionScanRow) => {
      if (!uid || entry.phase !== 'warehouse' || entry.status !== 'at_warehouse') return;
      setDeletingKey(entry.clientKey);
      try {
        await onlineDispatchService.deleteWarehouseShipment(uid, entry.docId);
        toast.success('تم حذف السجل نهائيًا من النظام');
        await loadWarehouseDispatchDayList();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'فشل الحذف');
      } finally {
        setDeletingKey(null);
      }
    },
    [uid, loadWarehouseDispatchDayList],
  );

  const onCameraDecoded = useCallback(
    (text: string) => {
      if (cameraScanLockRef.current) return;
      cameraScanLockRef.current = true;
      void runScan(text).finally(() => {
        cameraScanLockRef.current = false;
      });
    },
    [runScan],
  );

  useEffect(() => {
    if (inputMode !== 'manual' || busy) {
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
  }, [value, inputMode, busy, runScan]);

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

  const dayListLoading = scanMode === 'warehouse' ? warehouseListLoading : postListLoading;
  const dayScanCount = scanMode === 'warehouse' ? warehouseDayRows.length : postDayRows.length;

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
        secondaryAction={{
          label: 'عودة للوحة',
          icon: 'layout_dashboard',
          onClick: () => navigate('/online'),
        }}
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
        <div
          className={cn(
            'flex items-stretch justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm',
            scanMode === 'warehouse'
              ? 'border-sky-500/35 bg-gradient-to-l from-sky-500/[0.14] to-transparent dark:from-sky-500/20'
              : 'border-emerald-500/35 bg-gradient-to-l from-emerald-500/[0.14] to-transparent dark:from-emerald-500/20',
          )}
          aria-live="polite"
          role="status"
        >
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm font-bold leading-tight text-[var(--color-text)]">
                عدد المسح اليوم
              </span>
              <ScanLine
                className={cn(
                  'h-5 w-5 shrink-0',
                  scanMode === 'warehouse'
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-emerald-600 dark:text-emerald-400',
                )}
                aria-hidden
              />
            </div>
            <span className="text-[11px] leading-snug text-[var(--color-text-muted)]">
              يُحتسب من الساعة {WAREHOUSE_DISPATCH_DAY_START_HOUR}:00 صباحًا (بداية يوم العمل)
            </span>
          </div>
          <div
            className={cn(
              'flex min-h-[3.5rem] min-w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-xl px-3 tabular-nums',
              scanMode === 'warehouse'
                ? 'bg-sky-600/20 text-sky-950 dark:bg-sky-500/25 dark:text-sky-50'
                : 'bg-emerald-600/20 text-emerald-950 dark:bg-emerald-500/25 dark:text-emerald-50',
            )}
          >
            {dayListLoading ? (
              <span className="text-3xl font-bold leading-none animate-pulse opacity-60">…</span>
            ) : (
              <span className="text-3xl font-bold leading-none tracking-tight">{dayScanCount}</span>
            )}
          </div>
        </div>
        {/* <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          على الموبايل (خصوصاً Safari على آيفون) يجب السماح بالكاميرا من نافذة المتصفح عند الضغط أعلاه؛ إن لم تظهر، تحقق من إعدادات الموقع أو أن الصفحة تُفتح عبر HTTPS.
        </p> */}

        {inputMode === 'manual' ? (
          <>
            {/* <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              استخدم لوحة المفاتيح أو قارئ الباركود المتصل (يُدخل النص كلوحة مفاتيح): ركّز الحقل ثم امسح، وعادةً يُرسل القارئ زر Enter؛ أو اضغط «تسجيل».
            </p> */}
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
            onDecoded={onCameraDecoded}
            onScannerError={(m) => toast.error(m)}
          />
        )}
      </div>

      <SessionScanList
        scanMode={scanMode}
        dispatchDayStartMs={dispatchDayStartMs}
        dayListLoading={dayListLoading}
        rows={scanMode === 'warehouse' ? warehouseDayRows : postDayRows}
        canDeleteWarehouse={canRevertWarehouseScan}
        deletingKey={deletingKey}
        onDeleteWarehouse={deleteWarehouseSessionRow}
      />
    </div>
  );
};

const PHASE_SESSION_TITLE: Record<ScanMode, string> = {
  warehouse: 'تسليم للمخزن — اليوم (من 8 صباحًا)',
  post: 'تسليم للبوسطة — اليوم (من 8 صباحًا)',
};

const STATUS_LABEL: Record<OnlineDispatchStatus, string> = {
  pending: 'في انتظار المخزن',
  at_warehouse: 'عند المخزن',
  handed_to_post: 'تم للبوسطة',
};

function SessionScanList(props: {
  scanMode: ScanMode;
  dispatchDayStartMs: number;
  dayListLoading: boolean;
  rows: SessionScanRow[];
  canDeleteWarehouse: boolean;
  deletingKey: string | null;
  onDeleteWarehouse: (row: SessionScanRow) => void;
}) {
  const { scanMode, dispatchDayStartMs, dayListLoading, rows, canDeleteWarehouse, deletingKey, onDeleteWarehouse } =
    props;

  const actorLabels = useFirestoreUserLabels(rows.map((row) => row.actorUid));

  const dispatchDayLabel = new Date(dispatchDayStartMs).toLocaleString('ar-EG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const warehouseSubtitle = `كل الشحنات التي سُجِّل لها تسليم المخزن منذ بداية «يوم العمل» عند الساعة ${WAREHOUSE_DISPATCH_DAY_START_HOUR}:00 صباحًا (${dispatchDayLabel}) حتى الآن. يبدأ يوم جديد كل يوم عند نفس الساعة. القائمة من قاعدة البيانات.`;

  const postSubtitle = `كل الشحنات التي سُجِّل لها تسليم البوسطة منذ بداية «يوم العمل» عند الساعة ${WAREHOUSE_DISPATCH_DAY_START_HOUR}:00 صباحًا (${dispatchDayLabel}) حتى الآن. يبدأ يوم جديد كل يوم عند نفس الساعة. القائمة من قاعدة البيانات.`;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <div className="px-4 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] space-y-1">
        <div className="font-bold text-sm">{PHASE_SESSION_TITLE[scanMode]}</div>
        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
          {scanMode === 'warehouse' ? warehouseSubtitle : postSubtitle}
        </p>
      </div>
      {dayListLoading ? (
        <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">جاري تحميل قائمة اليوم…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">
          {scanMode === 'warehouse'
            ? 'لا توجد عمليات مسح مخزن في نطاق اليوم بعد'
            : 'لا توجد عمليات تسليم بوسطة في نطاق اليوم بعد'}
        </p>
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
                    {row.actorUid ? (
                      <>
                        من {actorLabels[row.actorUid] ?? '…'} ·{' '}
                      </>
                    ) : (
                      <>من غير مسجّل · </>
                    )}
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
                    {deletingKey === row.clientKey ? 'جاري…' : 'حذف نهائي'}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {scanMode === 'warehouse' && (
        <p className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] border-t border-[var(--color-border)]/60 bg-[var(--color-bg)]/50">
          «حذف نهائي» يزيل سجل الشحنة من قاعدة البيانات بالكامل طالما كانت عند المخزن ولم تُسجَّل للبوسطة بعد؛ يتطلب صلاحية الإدارة أو مسح المخزن.
        </p>
      )}
    </div>
  );
}
