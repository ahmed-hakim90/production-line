import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Badge, Button, KPIBox } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useShallowStore } from '../../../store/useAppStore';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';
import { scanEventService } from '../services/scanEventService';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { formatNumber, getTodayDateString } from '../../../utils/calculations';
import { qualitySettingsService } from '../../quality/services/qualitySettingsService';
import {
  WORK_ORDER_OPERATION_KEYS,
  WORK_ORDER_UPDATE_PATHS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';

const formatTs = (ts: any) => {
  if (!ts) return '—';
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatElapsed = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const DEFAULT_BREAK_START = '12:00';
const DEFAULT_BREAK_END = '12:30';
const DEFAULT_WORK_END = '16:00';

const toMinutes = (hm: string) => {
  const [h, m] = hm.split(':');
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return (hh * 60) + mm;
};

const toDayTimeMs = (baseMs: number, hm: string) => {
  const d = new Date(baseMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + (toMinutes(hm) * 60 * 1000);
};

export const WorkOrderScanner: React.FC = () => {
  const { id: workOrderId } = useParams<{ id: string }>();
  const navigate = useTenantNavigate();
  const {
    workOrders,
    _rawProducts,
    _rawLines,
    _rawEmployees,
    currentEmployee,
    workOrderScanEvents,
    liveProduction,
    fetchWorkOrders,
    subscribeToWorkOrderScans,
    toggleBarcodeScan,
    updateWorkOrder,
    systemSettings,
  } = useShallowStore((s) => ({
    workOrders: s.workOrders,
    _rawProducts: s._rawProducts,
    _rawLines: s._rawLines,
    _rawEmployees: s._rawEmployees,
    currentEmployee: s.currentEmployee,
    workOrderScanEvents: s.workOrderScanEvents,
    liveProduction: s.liveProduction,
    fetchWorkOrders: s.fetchWorkOrders,
    subscribeToWorkOrderScans: s.subscribeToWorkOrderScans,
    toggleBarcodeScan: s.toggleBarcodeScan,
    updateWorkOrder: s.updateWorkOrder,
    systemSettings: s.systemSettings,
  }));
  const scannerPathEnabled = isOperationPathEnabled(
    systemSettings,
    WORK_ORDER_OPERATION_KEYS.update,
    WORK_ORDER_UPDATE_PATHS.scanner,
  );

  const [serialInput, setSerialInput] = useState('');
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeWorkers, setCloseWorkers] = useState(0);
  const [closeWorkHours, setCloseWorkHours] = useState(0);
  const [closeConfirmedQty, setCloseConfirmedQty] = useState('');
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeWorkersSource, setCloseWorkersSource] = useState<'line_assignment' | 'work_order'>('work_order');
  const [timerNow, setTimerNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playFeedbackTone = useCallback((type: 'success' | 'error') => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioCtx();
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = type === 'success' ? 'sine' : 'square';
    oscillator.frequency.value = type === 'success' ? 880 : 220;
    gainNode.gain.value = 0.0001;
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;
    const end = now + 0.12;
    gainNode.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.start(now);
    oscillator.stop(end);
  }, []);

  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  useEffect(() => {
    if (!workOrderId) return;
    const unsub = subscribeToWorkOrderScans(workOrderId);
    return () => unsub();
  }, [workOrderId, subscribeToWorkOrderScans]);

  const workOrder = useMemo(
    () => workOrders.find((w) => w.id === workOrderId) ?? null,
    [workOrders, workOrderId],
  );

  const productName = useMemo(
    () => _rawProducts.find((p) => p.id === workOrder?.productId)?.name ?? '—',
    [_rawProducts, workOrder?.productId],
  );
  const lineName = useMemo(
    () => _rawLines.find((l) => l.id === workOrder?.lineId)?.name ?? '—',
    [_rawLines, workOrder?.lineId],
  );
  const supervisorName = useMemo(
    () => _rawEmployees.find((e) => e.id === workOrder?.supervisorId)?.name ?? '—',
    [_rawEmployees, workOrder?.supervisorId],
  );

  const sessions = useMemo(
    () => scanEventService.sessionsFromEvents(workOrderScanEvents),
    [workOrderScanEvents],
  );

  const summary = liveProduction[workOrderId ?? ''] ?? scanEventService.summaryFromSessions(sessions);
  const scannerDate = useMemo(() => getTodayDateString(), []);
  const breakStartTime = workOrder?.breakStartTime || DEFAULT_BREAK_START;
  const breakEndTime = workOrder?.breakEndTime || DEFAULT_BREAK_END;
  const workdayEndTime = workOrder?.workdayEndTime || DEFAULT_WORK_END;
  const openSessionsCount = useMemo(
    () => sessions.filter((session) => session.status === 'open').length,
    [sessions],
  );
  const hasActiveManualPause = useMemo(
    () => !!workOrder?.scanPauseWindows?.some((w) => w.reason === 'manual' && !w.endAt),
    [workOrder?.scanPauseWindows],
  );
  const breakCountdown = useMemo(() => {
    const breakStartMs = toDayTimeMs(timerNow, breakStartTime);
    const breakEndMs = toDayTimeMs(timerNow, breakEndTime);
    if (timerNow < breakStartMs) {
      return { value: formatElapsed((breakStartMs - timerNow) / 1000), label: 'متبقي على البريك' };
    }
    if (timerNow < breakEndMs) {
      return { value: formatElapsed((breakEndMs - timerNow) / 1000), label: 'متبقي على نهاية البريك' };
    }
    return { value: 'انتهى', label: 'البريك' };
  }, [breakEndTime, breakStartTime, timerNow]);
  const workEndCountdown = useMemo(() => {
    const workEndMs = toDayTimeMs(timerNow, workdayEndTime);
    if (timerNow < workEndMs) return formatElapsed((workEndMs - timerNow) / 1000);
    return 'انتهى';
  }, [timerNow, workdayEndTime]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const openCloseModal = useCallback(async () => {
    const fallbackWorkers = summary.activeWorkers || workOrder?.actualWorkersCount || workOrder?.maxWorkers || 0;
    setCloseWorkers(fallbackWorkers);
    setCloseWorkersSource('work_order');
    setCloseWorkHours(workOrder?.actualWorkHours ?? (workOrder as any).workHours ?? 0);
    // Leave manual quantity empty by default:
    // if user doesn't enter anything, we fallback to latest scanned qty.
    setCloseConfirmedQty('');
    setCloseModalOpen(true);
    if (!workOrder?.lineId) return;
    try {
      const assignments = await lineAssignmentService.getByLineAndDate(workOrder.lineId, scannerDate);
      if (assignments.length > 0) {
        setCloseWorkers(assignments.length);
        setCloseWorkersSource('line_assignment');
      }
    } catch {
      // Keep fallback workers from work order if assignment lookup fails.
    }
  }, [scannerDate, summary.activeWorkers, summary.completedUnits, workOrder?.actualWorkersCount, workOrder?.lineId, workOrder?.maxWorkers]);

  const handleScan = async (rawCode: string) => {
    if (!workOrder || !workOrderId) return;
    if (workOrder.status === 'completed') {
      setScanError('تم إغلاق أمر الشغل — المسح غير متاح');
      return;
    }
    const code = rawCode.trim();
    if (!code) return;

    setBusy(true);
    setScanMsg(null);
    setScanError(null);
    try {
      const result = await toggleBarcodeScan({
        workOrderId,
        lineId: workOrder.lineId,
        productId: workOrder.productId,
        serialBarcode: code,
        ...(currentEmployee?.id ? { employeeId: currentEmployee.id } : {}),
        timingConfig: {
          breakStartTime,
          breakEndTime,
          pauseWindows: workOrder.scanPauseWindows || [],
        },
      });
      if (result.action === 'IN') {
        setScanMsg(`تم تسجيل دخول للوحدة: ${code}`);
      } else {
        setScanMsg(`تم تسجيل خروج للوحدة: ${code} — زمن الدورة ${formatNumber(result.cycleSeconds || 0)} ثانية`);
      }
      playFeedbackTone('success');
      setSerialInput('');
    } catch (error: any) {
      setScanError(error?.message || 'فشل تسجيل الاسكان، حاول مرة أخرى');
      playFeedbackTone('error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleManualPause = useCallback(async () => {
    if (!workOrder || !workOrderId || workOrder.status === 'completed') return;
    if (!hasActiveManualPause && openSessionsCount === 0) {
      setScanError('لا يمكن إيقاف الزمن بدون جلسات قيد التشغيل');
      return;
    }
    setScanMsg(null);
    setScanError(null);
    try {
      const nowIso = new Date().toISOString();
      const windows = [...(workOrder.scanPauseWindows || [])];
      if (hasActiveManualPause) {
        const idx = [...windows].reverse().findIndex((w) => w.reason === 'manual' && !w.endAt);
        if (idx < 0) return;
        const realIndex = windows.length - 1 - idx;
        windows[realIndex] = { ...windows[realIndex], endAt: nowIso };
        await updateWorkOrder(
          workOrderId,
          { scanPauseWindows: windows },
          { path: WORK_ORDER_UPDATE_PATHS.scanner },
        );
        setScanMsg('تم استئناف التشغيل');
        playFeedbackTone('success');
        return;
      }
      windows.push({ reason: 'manual', startAt: nowIso });
      await updateWorkOrder(
        workOrderId,
        { scanPauseWindows: windows },
        { path: WORK_ORDER_UPDATE_PATHS.scanner },
      );
      setScanMsg('تم إيقاف التشغيل مؤقتًا');
      playFeedbackTone('success');
    } catch (error: any) {
      setScanError(error?.message || 'فشل تحديث حالة الإيقاف/الاستئناف');
      playFeedbackTone('error');
    }
  }, [hasActiveManualPause, openSessionsCount, playFeedbackTone, updateWorkOrder, workOrder, workOrderId]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (!workOrderId) return;
    const ok = window.confirm('هل تريد حذف هذه الجلسة؟ سيتم حذف الدخول والخروج المرتبطين بها.');
    if (!ok) return;
    setScanMsg(null);
    setScanError(null);
    setDeletingSessionId(sessionId);
    try {
      await scanEventService.deleteSession(workOrderId, sessionId);
      const latest = await scanEventService.buildWorkOrderSummary(workOrderId);
      await updateWorkOrder(workOrderId, {
        actualProducedFromScans: latest.summary.completedUnits || 0,
        actualWorkersCount: latest.summary.activeWorkers || 0,
        scanSummary: latest.summary,
      }, { path: WORK_ORDER_UPDATE_PATHS.scanner });
      setScanMsg('تم حذف الجلسة بنجاح');
      playFeedbackTone('success');
    } catch (error: any) {
      setScanError(error?.message || 'فشل حذف الجلسة');
      playFeedbackTone('error');
    } finally {
      setDeletingSessionId(null);
    }
  }, [playFeedbackTone, updateWorkOrder, workOrderId]);

  const handleCloseWorkOrder = useCallback(async () => {
    if (!workOrder || !workOrderId) return;
    setCloseBusy(true);
    setScanMsg(null);
    setScanError(null);
    try {
      const qualityPolicies = await qualitySettingsService.getPolicies();
      if (qualityPolicies.closeRequiresQualityApproval && workOrder.qualityStatus !== 'approved') {
        setScanError('لا يمكن إنهاء أمر الشغل قبل اعتماد الجودة');
        playFeedbackTone('error');
        return;
      }
      const latest = await scanEventService.buildWorkOrderSummary(workOrderId);
      if (latest.openSessions.length > 0) {
        setScanError(`لا يمكن إنهاء أمر الشغل لوجود ${latest.openSessions.length} جلسة قيد التشغيل بدون تسجيل خروج`);
        playFeedbackTone('error');
        return;
      }
      const scannedQty = latest.summary.completedUnits || 0;
      const confirmedQtyRaw = closeConfirmedQty.trim();
      const hasManualConfirmedQty = confirmedQtyRaw !== '';
      const parsedConfirmedQty = Number(confirmedQtyRaw);
      const confirmedQty = hasManualConfirmedQty && Number.isFinite(parsedConfirmedQty) && parsedConfirmedQty >= 0
        ? parsedConfirmedQty
        : scannedQty;

      const closeNotes: string[] = [];
      if (hasManualConfirmedQty && confirmedQty !== scannedQty) {
        closeNotes.push(`الكمية المؤكدة عند الإغلاق: ${confirmedQty} (كمية الاسكان: ${scannedQty})`);
      }
      closeNotes.push(`العمالة الفعلية عند الإغلاق: ${Number(closeWorkers) || 0}`);
      const mergedNote = [workOrder.notes, ...closeNotes].filter(Boolean).join(' | ');

      await updateWorkOrder(workOrderId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        // Manual confirmed qty overrides scan qty when provided.
        actualProducedFromScans: confirmedQty,
        actualWorkersCount: Number(closeWorkers) || 0,
        scanSummary: {
          ...latest.summary,
          completedUnits: confirmedQty,
          activeWorkers: Number(closeWorkers) || 0,
        },
        scanSessionClosedAt: new Date().toISOString(),
        actualWorkHours: Number(closeWorkHours) || 0,
        notes: mergedNote,
      }, { path: WORK_ORDER_UPDATE_PATHS.scanner });

      setCloseModalOpen(false);
      setScanMsg('تم إنهاء أمر الشغل بنجاح');
      playFeedbackTone('success');
    } catch (error: any) {
      setScanError(error?.message || 'فشل إنهاء أمر الشغل');
      playFeedbackTone('error');
    } finally {
      setCloseBusy(false);
    }
  }, [closeConfirmedQty, closeWorkers, closeWorkHours, playFeedbackTone, updateWorkOrder, workOrder, workOrderId]);

  useEffect(() => {
    if (workOrder?.status === 'completed') return;

    const flushBuffer = () => {
      const code = scanBufferRef.current.trim();
      scanBufferRef.current = '';
      if (!code || busy) return;
      void handleScan(code);
    };

    const scheduleFlush = () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      // Barcode scanners usually send characters very fast; short idle means scan end.
      scanTimerRef.current = setTimeout(flushBuffer, 120);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Enter') {
        if (scanBufferRef.current.trim()) {
          e.preventDefault();
          flushBuffer();
        }
        return;
      }
      if (e.key.length !== 1) return;
      scanBufferRef.current += e.key;
      scheduleFlush();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [busy, handleScan, workOrder?.status]);

  useEffect(() => {
    if (closeModalOpen || workOrder?.status === 'completed') return;
    inputRef.current?.focus();
  }, [closeModalOpen, workOrder?.status]);

  if (!scannerPathEnabled) {
    return (
      <div className="erp-empty-state">
        <h2 className="text-lg font-bold">مسار ماسح أمر الشغل متوقف</h2>
        <p className="text-sm text-muted-foreground">يمكن لمسؤول النظام تشغيله من إعدادات مسارات العمليات.</p>
      </div>
    );
  }

  if (!workOrderId) {
    return (
      <ModuleOpsPageShell eyebrow="الإنتاج" rangeLabel="ماسح أمر الشغل">
        <OpsDashPanel accent="production">
          <p className="text-sm font-bold text-[rgb(var(--color-danger))]">رقم أمر الشغل غير صحيح.</p>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  if (!workOrder) {
    return (
      <ModuleOpsPageShell eyebrow="الإنتاج" rangeLabel="ماسح أمر الشغل">
        <OpsDashPanel accent="production">
          <div className="space-y-3">
            <p className="text-sm font-bold text-[var(--color-text-muted)]">جاري تحميل أمر الشغل...</p>
            <Button variant="outline" onClick={() => navigate('/work-orders')}>رجوع لأوامر الشغل</Button>
          </div>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  if (currentEmployee?.level === 2 && workOrder.supervisorId !== currentEmployee.id) {
    return (
      <ModuleOpsPageShell eyebrow="الإنتاج" rangeLabel="ماسح أمر الشغل">
        <OpsDashPanel accent="production">
          <div className="space-y-3">
            <p className="text-sm font-bold text-[rgb(var(--color-danger))]">لا يمكنك فتح أمر شغل غير مرتبط بك كمشرف.</p>
            <Button variant="outline" onClick={() => navigate('/work-orders')}>رجوع لأوامر الشغل</Button>
          </div>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  return (
    <ModuleOpsPageShell
      eyebrow="الإنتاج"
      rangeLabel={`${workOrder.workOrderNumber} — ${productName} — ${lineName}`}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={workOrder.status === 'completed' ? 'success' : workOrder.status === 'in_progress' ? 'warning' : 'info'}>
            {workOrder.status === 'completed' ? 'مكتمل' : workOrder.status === 'in_progress' ? 'قيد التنفيذ' : 'قيد الانتظار'}
          </Badge>
          {workOrder.status !== 'completed' && (
            <Button
              variant="outline"
              onClick={handleToggleManualPause}
              disabled={openSessionsCount === 0 && !hasActiveManualPause}
            >
              <span className="material-icons-round text-sm">
                {hasActiveManualPause ? 'play_arrow' : 'pause_circle'}
              </span>
              {hasActiveManualPause ? 'استئناف' : 'وقف'}
            </Button>
          )}
          {workOrder.status !== 'completed' && (
            <Button variant="primary" onClick={openCloseModal}>
              <span className="material-icons-round text-sm">task_alt</span>
              الانتهاء
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/work-orders')}>رجوع</Button>
        </div>
      )}
    >
      <p className="text-xs text-[var(--color-text-muted)] -mt-2 mb-2">المشرف: {supervisorName}</p>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPIBox label="وحدات مكتملة" value={summary.completedUnits} icon="check_circle" colorClass="bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]" />
        <KPIBox label="وحدات قيد التشغيل" value={summary.inProgressUnits} icon="hourglass_top" colorClass="bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]" />
        <KPIBox label="عمالة فعالة" value={summary.activeWorkers} icon="groups" colorClass="bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))]" />
        <KPIBox label="متوسط السيكل تايم" value={summary.avgCycleSeconds} icon="timer" unit="ث" colorClass="bg-[rgb(var(--color-secondary)/0.1)] text-[rgb(var(--color-secondary))] dark:bg-[rgb(var(--color-secondary))]/30 dark:text-[rgb(var(--color-secondary))]" />
        <KPIBox label={breakCountdown.label} value={breakCountdown.value} icon="free_breakfast" colorClass="bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]" />
        <KPIBox label="متبقي على نهاية الوردية اليوم" value={workEndCountdown} icon="event_available" colorClass="bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]" />
      </div>

      <OpsDashPanel title="تسجيل الاسكان" accent="production">
        {workOrder.status !== 'completed' ? (
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="flex-1">
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">باركود الوحدة (Serial)</label>
              <input
                ref={inputRef}
                type="text"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && serialInput.trim() && !busy) {
                    handleScan(serialInput);
                  }
                }}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                placeholder="امسح أو أدخل السيريال ثم Enter"
                autoFocus
                onBlur={() => {
                  if (closeModalOpen || workOrder?.status === 'completed') return;
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="primary" onClick={() => handleScan(serialInput)} disabled={busy || !serialInput.trim()}>
                {busy && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                تسجيل الاسكان
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm font-bold text-[var(--color-text-muted)]">تم إغلاق أمر الشغل — عرض السجل فقط.</p>
        )}
        {scanMsg && (
          <p className="mt-3 text-sm font-bold text-[rgb(var(--color-success))]">{scanMsg}</p>
        )}
        {scanError && (
          <p className="mt-3 text-sm font-bold text-[rgb(var(--color-danger))]">{scanError}</p>
        )}
      </OpsDashPanel>

      <OpsDashPanel
        title="سجل الوحدات"
        accent="production"
        action={<span className="text-xs text-[var(--color-text-muted)]">آخر {sessions.length} جلسة</span>}
        bodyClassName="p-0 overflow-hidden"
      >
        <div className="overflow-x-auto p-4 pt-0">
          <table className="erp-table w-full text-sm">
            <thead className="erp-thead">
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs font-bold">
                <th className="erp-th">المنتج</th>
                <th className="erp-th">الباركود</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th">دخول</th>
                <th className="erp-th">خروج</th>
                <th className="erp-th">السيكل تايم</th>
                <th className="erp-th">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--color-text-muted)]">لا توجد جلسات اسكان بعد</td>
                </tr>
              )}
              {sessions.map((session) => (
                <tr key={session.sessionId} className="border-b border-[var(--color-border)]">
                  <td className="py-3 px-3 font-bold">{productName}</td>
                  <td className="py-3 px-3 font-mono text-xs">{session.serialBarcode}</td>
                  <td className="py-3 px-3">
                    <Badge variant={session.status === 'closed' ? 'success' : 'warning'}>
                      {session.status === 'closed' ? 'مكتمل' : 'قيد التشغيل'}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-[var(--color-text-muted)] font-mono text-xs">{formatTs(session.inAt)}</td>
                  <td className="py-3 px-3 text-[var(--color-text-muted)] font-mono text-xs">{formatTs(session.outAt)}</td>
                  <td className="py-3 px-3 font-mono text-xs font-bold">
                    {session.status === 'open' ? (
                      <span className="text-[rgb(var(--color-warning))]">
                        {formatElapsed(scanEventService.computeEffectiveCycleSeconds({
                          inAt: session.inAt,
                          outAtMs: timerNow,
                          breakStartTime,
                          breakEndTime,
                          pauseWindows: workOrder.scanPauseWindows || [],
                          minSeconds: 0,
                        }))} جاري
                      </span>
                    ) : session.cycleSeconds ? (
                      <span>{formatElapsed(session.cycleSeconds)} ({formatNumber(session.cycleSeconds)} ث)</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {workOrder.status !== 'completed' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSession(session.sessionId)}
                        disabled={deletingSessionId === session.sessionId}
                      >
                        {deletingSessionId === session.sessionId ? 'جاري الحذف...' : 'إزالة'}
                      </Button>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)] font-bold">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OpsDashPanel>

      {closeModalOpen && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => !closeBusy && setCloseModalOpen(false)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1">تأكيد إنهاء أمر الشغل</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">{workOrder.workOrderNumber} — {productName}</p>

            <div className="space-y-3">
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-3">
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">كمية الاسكان الحالية (لحظي)</p>
                <p className="text-xl font-bold text-[rgb(var(--color-success))]">{formatNumber(summary.completedUnits)}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">الكمية الفعلية (اختياري)</label>
                <input
                  type="number"
                  min={0}
                  value={closeConfirmedQty}
                  onChange={(e) => setCloseConfirmedQty(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
                  placeholder={`${summary.completedUnits || 0}`}
                />
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1">لو تركتها فارغة سيتم اعتماد آخر كمية من الاسكان.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">عدد العمالة الفعلية</label>
                <input
                  type="number"
                  min={0}
                  value={closeWorkers}
                  onChange={(e) => setCloseWorkers(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
                />
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  المصدر الافتراضي: {closeWorkersSource === 'line_assignment' ? `ربط العمالة على الخط (${scannerDate})` : 'عدد العمالة بأمر الشغل'} — ويمكنك التعديل يدويًا.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">ساعات العمل الفعلية</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={closeWorkHours}
                  onChange={(e) => setCloseWorkHours(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-5">
              <Button variant="outline" onClick={() => setCloseModalOpen(false)} disabled={closeBusy}>إلغاء</Button>
              <Button variant="primary" onClick={handleCloseWorkOrder} disabled={closeBusy || closeWorkHours <= 0}>
                {closeBusy && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                تأكيد الإنهاء
              </Button>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}

    </ModuleOpsPageShell>
  );
};




